import { atom, read, update } from 'claude-code'
import type { Register } from 'claude-code'

import { FRAME_MS, encode, isFinalBlock, makeRain, makeReveal } from './rain'
import type { Rain, Reveal } from './rain'

const RAIN_KEY = 'rain'
const REVEAL_KEY = 'reveal'
const LEGACY_PANE = 'matrix' // the v0.1 sidebar pane, closed if a reload finds it open

// Matrix mode survives reloads and restarts of the session: it lives in $.state.
const isOnAtom = atom({ plugin: 'matrix-mode', key: 'isOn' } as const, false)

// Rows kept for the prompt, footer and the status line under the rain.
const CHROME_ROWS = 7

// If no transcript block claims the reveal within this long, give the screen back.
const NO_HOST_MS = 1000

const clamp = (n: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, n))

// True while the transcript is held blank: a turn runs, or its answer is revealing,
// and matrix mode is on. Top-level on purpose: the module checker follows `$` only
// into top-level functions.
async function isActive($: Parameters<typeof read>[0], isHolding: boolean): Promise<boolean> {
  return isHolding && (await read($, isOnAtom))
}

export const register: Register = on => {
  let timer: { cancel: () => void } | null = null
  let rain: Rain | null = null
  let size = { columns: 0, rows: 0 }
  let lastTool = ''
  // The spinner row's render instance: the site $.ui.blit repaints the rain in.
  let spinnerId = ''

  // Phase 1: a model turn runs. Phase 2: its answer reveals. Both hold the transcript blank.
  let isWorking = false
  let isRevealing = false
  let answerText = ''
  let reveal: Reveal | null = null
  let revealId = '' // the final answer block's render instance: where the reveal is blitted
  let frames = 0 // reveal clock: frames since the reveal was built

  const stop = () => {
    timer?.cancel()
    timer = null
  }

  // Ends the reveal (it finished, or the person typed or sent something) and hands
  // the screen back. `redraw` is passed in so this closure never touches `$`.
  const finish = (redraw: () => void) => {
    isRevealing = false
    reveal = null
    revealId = ''
    answerText = ''
    rain = null
    stop()
    redraw()
  }

  on('session.start', async ($, e, next) => {
    // v0.1 opened a sidebar pane that outlives a reload; this version has none.
    await $.ui.close({ id: LEGACY_PANE })

    await $.command.register({
      name: 'matrix',
      description: 'Matrix mode on: rain instead of the transcript while Claude works',
    })
    await $.command.register({
      name: 'matrix-off',
      description: 'Matrix mode off: the normal transcript while Claude works',
    })

    return next(e)
  })

  on('command.run', { command: 'matrix' }, async $ => {
    await update($, isOnAtom, () => true)

    return { text: 'Matrix mode on. Rain replaces the transcript while Claude works, and the answer is revealed at the end. /matrix-off to stop.' }
  })

  on('command.run', { command: 'matrix-off' }, async $ => {
    await update($, isOnAtom, () => false)
    finish(() => $.ui.invalidate('ui.render'))
    $.ui.status(undefined)

    return { text: 'Matrix mode off.' }
  })

  on('prompt.submit', async ($, e, next) => {
    // A new prompt during a reveal skips it.
    if (isRevealing) finish(() => undefined)

    isWorking = true
    lastTool = ''

    if (await read($, isOnAtom)) {
      stop()
      timer = $.clock.every(FRAME_MS, () => {
        // Nothing to paint until the spinner row has drawn the Raster once.
        if (rain !== null && spinnerId !== '') {
          void $.ui.blit({ requestId: spinnerId, key: RAIN_KEY, cells: encode(rain.step()) })
        }
      })
      $.ui.invalidate('ui.render') // blank the rows already on screen at once
    }

    return next(e)
  }).catch(async ($, e, next) => {
    // Fail open: the rain is cosmetic, so a failure in this hook must never block
    // the prompt. If the hook failed before next(), carry on; if after, keep its result.
    if (next.called) return next(e)

    return next(e)
  })

  // Typing anything skips the reveal.
  on('prompt.edit', ($, e, next) => {
    if (isRevealing) finish(() => $.ui.invalidate('ui.render'))

    return next(e)
  })

  on('tool.call', async ($, e, next) => {
    lastTool = e.tool
    // The live line names the tool: one redraw for the text (the rain is blitted).
    if (await isActive($, isWorking)) $.ui.invalidate('ui.render')

    return next(e)
  }).catch(async ($, e, next) => {
    // Fail open: the rain is cosmetic, so a failure in this hook must never block
    // the tool call. If the hook failed before next(), carry on; if after, keep its result.
    if (next.called) return next(e)

    return next(e)
  })

  on('turn.complete', async ($, e, next) => {
    // A subagent ending mid-turn must not bring the transcript back.
    if (e.agentId !== undefined) return next(e)

    const wasWorking = isWorking
    isWorking = false
    stop()
    spinnerId = ''

    const isOn = await read($, isOnAtom)
    const hasAnswer = e.reason === 'answer' && e.answer.trim() !== ''

    if (isOn && wasWorking && hasAnswer) {
      // Phase 2. The final answer block builds the reveal when it next draws; the
      // timer then blits it frame by frame and ends it when its time is up.
      isRevealing = true
      answerText = e.answer
      reveal = null
      revealId = ''
      frames = 0

      timer = $.clock.every(FRAME_MS, () => {
        frames += 1
        const elapsed = frames * FRAME_MS

        if (reveal === null) {
          // No block claimed the reveal: do not hold a blank screen for it.
          if (elapsed > NO_HOST_MS) finish(() => $.ui.invalidate('ui.render'))

          return
        }
        if (elapsed >= reveal.durationMs) {
          finish(() => $.ui.invalidate('ui.render'))

          return
        }
        if (rain !== null && revealId !== '') {
          const words = rain.step()
          reveal.paint(words, elapsed)
          void $.ui.blit({ requestId: revealId, key: REVEAL_KEY, cells: encode(words) })
        }
      })
    } else {
      rain = null
    }

    // Redraw: the transcript returns now, or the reveal takes over its last block.
    $.ui.invalidate('ui.render')

    return next(e)
  })

  // Blank every transcript row while the mode is on and a turn runs or reveals.
  // Dialogs (permissions, questions) are not in this list, so they always show.
  on('ui.render', { component: 'UserMessage' }, async ($, e, next) => {
    if (!(await isActive($, isWorking || isRevealing))) return next(e)
    const { Box } = $.ui.resolve(e)

    return <Box />
  })

  // The answer's own block hosts the reveal; every other block is blank.
  on('ui.render', { component: 'AssistantMessage' }, async ($, e, next) => {
    if (!(await isActive($, isWorking || isRevealing))) return next(e)

    if (e.surface !== 'terminal' || !isRevealing || !isFinalBlock(e.props.text, answerText)) {
      const { Box } = $.ui.resolve(e)

      return <Box />
    }

    const { Box, Raster } = $.ui.resolve(e)
    const columns = clamp(e.viewport?.columns ?? 100, 10, 512)
    const rows = clamp((e.viewport?.rows ?? 30) - CHROME_ROWS, 4, 256)

    if (rain === null || size.columns !== columns || size.rows !== rows) {
      size = { columns, rows }
      rain = makeRain(columns, rows)
    }
    if (reveal === null || reveal.columns !== columns || reveal.rows !== rows) {
      reveal = makeReveal(answerText, columns, rows)
      frames = 0
    }
    revealId = e.requestId

    const words = rain.step()
    reveal.paint(words, frames * FRAME_MS)

    return (
      <Box>
        <Raster key={REVEAL_KEY} columns={columns} rows={rows} cells={encode(words)} />
      </Box>
    )
  })

  on('ui.render', { component: 'ToolUse' }, async ($, e, next) => {
    if (!(await isActive($, isWorking || isRevealing))) return next(e)
    const { Box } = $.ui.resolve(e)

    return <Box />
  })

  on('ui.render', { component: 'ToolResult' }, async ($, e, next) => {
    if (!(await isActive($, isWorking || isRevealing))) return next(e)
    const { Box } = $.ui.resolve(e)

    return <Box />
  })

  on('ui.render', { component: 'ToolGroup' }, async ($, e, next) => {
    if (!(await isActive($, isWorking || isRevealing))) return next(e)
    const { Box } = $.ui.resolve(e)

    return <Box />
  })

  on('ui.render', { component: 'ToolProgress' }, async ($, e, next) => {
    if (!(await isActive($, isWorking || isRevealing))) return next(e)
    const { Box } = $.ui.resolve(e)

    return <Box />
  })

  on('ui.render', { component: 'CommandOutput' }, async ($, e, next) => {
    if (!(await isActive($, isWorking || isRevealing))) return next(e)
    const { Box } = $.ui.resolve(e)

    return <Box />
  })

  on('ui.render', { component: 'TurnDuration' }, async ($, e, next) => {
    if (!(await isActive($, isWorking || isRevealing))) return next(e)
    const { Box } = $.ui.resolve(e)

    return <Box />
  })

  on('ui.render', { component: 'InfoNotice' }, async ($, e, next) => {
    if (!(await isActive($, isWorking || isRevealing))) return next(e)
    const { Box } = $.ui.resolve(e)

    return <Box />
  })

  // The spinner row sits at the bottom of the transcript while a turn runs: it
  // becomes the rain (full width, nearly full height) and one live line.
  on('ui.render', { component: 'Spinner' }, async ($, e, next) => {
    if (e.surface !== 'terminal' || !(await isActive($, isWorking))) return next(e)
    const { Box, Raster, Text } = $.ui.resolve(e)
    spinnerId = e.requestId

    const columns = clamp(e.viewport?.columns ?? 100, 10, 512)
    const rows = clamp((e.viewport?.rows ?? 30) - CHROME_ROWS, 4, 256)

    if (rain === null || size.columns !== columns || size.rows !== rows) {
      size = { columns, rows }
      rain = makeRain(columns, rows)
    }

    const live = `${e.props.message ?? e.props.word}${e.props.suffix}${lastTool === '' ? '' : `  ${lastTool}`}`

    return (
      <Box flexDirection="column">
        <Raster key={RAIN_KEY} columns={columns} rows={rows} cells={encode(rain.step())} />
        <Text color="green">{live}</Text>
      </Box>
    )
  })
}

import { describe, expect, test } from 'claude-code/testing'

// Starts a turn with matrix mode on, as a person would: /matrix, then a prompt.
const startTurn = async ($: Parameters<Parameters<typeof test>[1] & ((...a: never[]) => unknown)>[0]) => {
  await $.command.run({ command: 'matrix' })
  await $.prompt.submit({ text: 'run ping' })
}

const ROW = {
  tool_use_id: 't1',
  tool: 'Bash',
  input: { command: 'ping -n 6 127.0.0.1' },
  isRunning: true,
  isErrored: false,
  isInterrupted: false,
} as const

describe('B: matrix mode blanks the transcript while a turn runs', () => {
  test('a tool row draws as an empty box the terminal accepts', async ($, on) => {
    on('prompt.submit', (_$, e) => e)
    await startTurn($ as never)

    const ui = await $.ui.mount({
      plugin: 'matrix-mode',
      surface: 'terminal',
      component: 'ToolUse',
      requestId: 't1',
      props: ROW,
    })

    // drawn() rejects if the terminal refused the tree, so reaching here proves it was valid.
    expect(await ui.drawn()).toMatchObject({ type: 'Box' })
    await ui.unmount()
  })

  test('an older assistant message is blanked too', async ($, on) => {
    on('prompt.submit', (_$, e) => e)
    await startTurn($ as never)

    const ui = await $.ui.mount({
      plugin: 'matrix-mode',
      surface: 'terminal',
      component: 'AssistantMessage',
      props: { text: 'an answer from an earlier turn', isFirstOfReply: true },
    })

    expect(await ui.drawn()).toMatchObject({ type: 'Box' })
    await ui.unmount()
  })

  test('the pill and the folded group are blanked', async ($, on) => {
    on('prompt.submit', (_$, e) => e)
    await startTurn($ as never)

    const pill = await $.ui.mount({
      plugin: 'matrix-mode',
      surface: 'terminal',
      component: 'ToolProgress',
      props: { tool_use_id: 't1', kind: 'background_hint', hint: '(ctrl+b to run in background)' },
    })
    expect(await pill.drawn()).toMatchObject({ type: 'Box' })
    await pill.unmount()

    const group = await $.ui.mount({
      plugin: 'matrix-mode',
      surface: 'terminal',
      component: 'ToolGroup',
      props: { calls: [], isActive: true, isExpanded: false },
    })
    expect(await group.drawn()).toMatchObject({ type: 'Box' })
    await group.unmount()
  })
})

describe('reveal: the answer builds on the rain when the turn ends', () => {
  test('the final answer block draws the reveal, an earlier block stays blank', async ($, on) => {
    on('prompt.submit', (_$, e) => e)
    on('turn.complete', (_$, e) => ({ text: e.answer }))
    await startTurn($ as never)

    await $.turn.complete({
      answer: 'All done.\n\nThe rain is denser now.',
      durationMs: 1000,
      isAborted: false,
      turnId: 'turn-1',
      reason: 'answer',
    })

    const viewport = { columns: 100, rows: 40, isFullscreen: true }
    const final = await $.ui.mount({
      plugin: 'matrix-mode',
      surface: 'terminal',
      component: 'AssistantMessage',
      props: { text: 'All done.\n\nThe rain is denser now.', isFirstOfReply: false },
      viewport,
    })
    expect(await final.find({ type: 'Raster', key: 'reveal' })).toBeDefined()
    await final.unmount()

    const earlier = await $.ui.mount({
      plugin: 'matrix-mode',
      surface: 'terminal',
      component: 'AssistantMessage',
      props: { text: 'Let me look at the files first.', isFirstOfReply: true },
      viewport,
    })
    expect(await earlier.find({ type: 'Raster' })).toBeUndefined()
    await earlier.unmount()
  })
})

describe('C: the spinner row becomes the rain', () => {
  test('it draws a Raster as wide as the viewport and a live line', async ($, on) => {
    on('prompt.submit', (_$, e) => e)
    await startTurn($ as never)

    const ui = await $.ui.mount({
      plugin: 'matrix-mode',
      surface: 'terminal',
      component: 'Spinner',
      props: { word: 'Cogitating', message: null, suffix: '…', mode: 'thinking' },
      viewport: { columns: 120, rows: 40, isFullscreen: true },
    })

    const raster = await ui.find({ type: 'Raster', key: 'rain' })
    expect(raster).toBeDefined()
    expect(await ui.find({ type: 'Text', text: /Cogitating/ })).toBeDefined()
    await ui.unmount()
  })
})

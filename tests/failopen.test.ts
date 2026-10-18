import { describe, expect, test } from 'claude-code/testing'

// The hooks that gate a prompt or a tool call must fail open: the rain is cosmetic,
// so a broken redraw may never stop the person's prompt or the tool.
describe('fail open: a broken redraw does not block the prompt or the tool', () => {
  test('prompt.submit still passes when ui.invalidate is denied', async ($, on) => {
    on('ui.invalidate', () => ({ deny: 'redraw failed' }))
    on('prompt.submit', (_$, e) => ({ text: e.text }))

    await $.command.run({ command: 'matrix' })
    const out = await $.prompt.submit({ text: 'hi' })

    expect(out).toMatchObject({ text: 'hi' })
  })

  test('tool.call still passes when ui.invalidate is denied', async ($, on) => {
    on('ui.invalidate', () => ({ deny: 'redraw failed' }))
    on('prompt.submit', (_$, e) => e)
    on('tool.call', () => ({ result: 'ok' }))

    await $.command.run({ command: 'matrix' })
    await $.prompt.submit({ text: 'hi' })
    const out = await $.tool.call({ tool: 'Bash', input: { command: 'echo hi' } })

    expect(out).toMatchObject({ result: 'ok' })
  })
})

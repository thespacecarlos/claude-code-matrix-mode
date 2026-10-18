# Changelog

## 0.4.0 - 2026-10-18
- `prompt.submit` and `tool.call` hooks now have a `.catch` handler and fail open: a failure in the rain can no longer block a prompt or a tool call.
- Tests that a denied redraw does not block the prompt or the tool.
- README: requirements, limitations, privacy and permissions, troubleshooting. Added `SECURITY.md` and `CONTRIBUTING.md`.
- CI: GitHub Actions runs `claude plugin validate --strict` and `claude plugin test` on Linux and Windows. `.gitattributes` keeps line endings as LF.

## 0.3.0
- Reveal: when a turn ends, the last message builds up line by line out of the rain.
- Esc skips straight to the full answer; typing stops the reveal.
- Windowed and full-screen tests.
- MIT license; repository named `claude-code-matrix-mode` (plugin and marketplace name stay `matrix-mode`).

## 0.2.0
- Full-screen overlay (the rain replaces the transcript while Claude works).
- Updated rain density.
- 30 fps mode with smoothing.

## 0.1.0
- Rain in a sidebar pane.
- FPS test.
- Architecture as a plugin, with on/off modes.

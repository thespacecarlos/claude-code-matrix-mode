# Changelog

## 0.4.5 - 2026-10-19
- README screenshots renamed so that no image shares its name with a code module (the Directory scan matched a test import to an image of the same name).

## 0.4.4 - 2026-10-19
- README screenshots resized to 1280 px wide (4.6 MB to 2.2 MB in total).

## 0.4.3 - 2026-10-19
- README: three screenshots (rain, reveal in progress, finished answer) replace the animated demo, which the Anthropic Directory scan flagged.
- `plugin.json`: added `supportUrl`, `documentationUrl` and `privacyPolicyUrl` for the Directory listing.

## 0.4.2 - 2026-10-18
- Removed `.gitattributes` (added in 0.4.0): the Anthropic Directory could not validate the repository with it present.
- Added a plugin icon.
- Removed the unused `types` field from `plugin.json` (Claude Code ignores it); `types/index.d.ts` stays for editors.
- Demo GIF re-encoded (0.9 MB to 0.4 MB): the Directory scan flagged a false positive in the old file's bytes.
- README: what each hook does.

## 0.4.1 - 2026-10-18
- README demo GIF shrunk from 6.5 MB to 0.9 MB (10 frames, 600 px) to fit the 5 MiB per-file limit of the Anthropic Directory.

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

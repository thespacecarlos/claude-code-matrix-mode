# Security policy

## Scope

`matrix-mode` is a cosmetic plugin. It makes no network requests, spawns no processes and does not read files or environment variables (see "Privacy and permissions" in the README). A security issue would most likely be one of:

- a hook that can block or alter a prompt or a tool call;
- a way to make the plugin read or send transcript content somewhere;
- unsafe handling of text from an answer when it is drawn.

## Reporting

Please do not open a public issue for a security problem. Email **karol.krajewski@stelleo.eu** with the plugin version (`/plugin`), your Claude Code version and steps to reproduce. Expect a first reply within a week.

## Supported versions

Only the latest release receives fixes.

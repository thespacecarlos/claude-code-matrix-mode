# Contributing

Issues and pull requests are welcome.

## Before you open a pull request

```
claude plugin validate . --strict
claude plugin test .
```

Both must pass. Tests live in `tests/` and use `claude-code/testing`.

## Guidelines

- The plugin is cosmetic, so it must fail open: a hook that gates a prompt or a tool call (`prompt.submit`, `tool.call`) always ends in `next(e)` and has a `.catch` handler on its registration.
- No network access, no child processes, no file access. A change that needs one is a different plugin.
- Keep drawing code in `hooks/rain.ts` (pure functions, easy to test) and event wiring in `hooks/register.tsx`.
- Add a line to `CHANGELOG.md` for every user-visible change. Version numbers live in `.claude-plugin/plugin.json` and the changelog; keep them equal.
- Match the surrounding style: short comments that say why, not what.

## License

By contributing you agree that your work is released under the [MIT license](LICENSE).

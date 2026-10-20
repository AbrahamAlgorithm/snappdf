# Contributing to snappdf

Thanks for wanting to help. snappdf is a small, solo-maintained project, so contributions are genuinely welcome. For anything bigger than a small fix, please open an issue first to talk through the approach, so we don't both spend time on something that won't get merged.

## Ways to contribute

- **Report a bug** — [open an issue](https://github.com/AbrahamAlgorithm/snappdf/issues/new) or use the [in-app report form](https://snappdf.abrahamalgorithm.tech/report).
- **Suggest a feature** — open an issue describing the problem it solves, not just the feature itself.
- **Fix something small** — typos, bugs, rough UX edges. Feel free to open a PR directly.
- **Add a tool or a bigger feature** — open an issue first so we can agree on the approach.

## Project setup

Requires Node 22+.

```bash
git clone https://github.com/AbrahamAlgorithm/snappdf.git
cd snappdf
npm install
npm run dev
```

The dev server runs at `http://localhost:3000`. Everything in `src/` runs entirely in the browser; `server/` is a small separate Node service for the bug-report form and isn't needed for most frontend work.

## Before you open a PR

Run the same checks CI runs on every pull request:

```bash
npm run lint   # tsc --noEmit
npm test       # vitest
npm run build  # vite build
```

All three need to pass. There's no separate linter or formatter beyond the TypeScript compiler, so just match the style already in the file you're editing.

## Code style

- Keep PRs focused: one fix or one feature per PR.
- Comments are rare here. Add one only when the *why* isn't obvious from the code, kept to a single short line, no blocks or JSDoc.
- No speculative abstractions, feature flags, or error handling for cases that can't happen.
- Match existing patterns, e.g. how [src/lib/site.ts](src/lib/site.ts) lists tools, or how a page under [src/pages/workspace/](src/pages/workspace/) is structured, rather than inventing a new one for the same kind of problem.
- Every file a tool touches stays on-device. Nothing gets uploaded, ever — that's the entire point of snappdf. A PR that sends file contents anywhere external won't be merged.

## Commit messages

This repo uses [Conventional Commits](https://www.conventionalcommits.org/): `feat:`, `fix:`, `docs:`, `test:`, `style:`, `chore:`, etc. Check `git log` for examples. Keep the first line short, and use the body for *why* the change was made, not a restatement of the diff.

## Pull requests

1. Fork the repo and branch off `main` (`git checkout -b feat/short-description`).
2. Make your change, with tests if you're touching [src/lib/](src/lib/).
3. Confirm lint, test and build all pass locally.
4. Open the PR against `main`. Describe what changed and why, and link the issue it closes, if any.
5. CI type-checks, tests, builds, runs an `npm audit`, and builds the Docker images on every PR — all of it needs to be green before merge.

## License

By contributing, you agree your contribution is licensed under this project's [MIT License](LICENSE).

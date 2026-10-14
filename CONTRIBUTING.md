# Contributing to inandu-grid-vue

## Ground rules

- Search existing [issues](https://github.com/inandusolutions/inandu-grid-vue/issues) and
  [discussions](https://github.com/inandusolutions/inandu-grid-vue/discussions) before opening a
  new one.
- Questions and usage help go in [Discussions](https://github.com/inandusolutions/inandu-grid-vue/discussions),
  not issues — see [SUPPORT.md](.github/SUPPORT.md).
- Security issues: **do not** open a public issue — see [SECURITY.md](.github/SECURITY.md).
- Be kind — see the [Code of Conduct](.github/CODE_OF_CONDUCT.md).

## Project layout

| Path | What it is |
| --- | --- |
| `src/` | The library — published to npm as `@inandu-solutions/grid-vue`. |
| `src/core/` | Framework-agnostic logic shared (by hand) with grid-angular and grid-react — no Vue imports. |
| `src/composables/` | `useInanduGrid()`, the headless engine. |
| `src/components/` | `<InanduGrid>` and its internal row/cell SFCs. |
| `site/` | The GitHub Pages demo/landing site. A separate npm project, not part of the library build. |
| `examples/stackblitz/` | The minimal StackBlitz example. Also a separate npm project — it installs `@inandu-solutions/grid-vue` from npm, not from local source. |

## Setup

```bash
npm install
```

`site/` and `examples/stackblitz/` each need their own `npm install` if you're working on them —
they're independent npm projects, not npm workspaces.

## Commands

```bash
npm run typecheck    # vue-tsc --noEmit
npm test             # vitest run (jsdom + Vue Testing Library)
npm run test:watch   # vitest, watch mode
npm run build        # library build -> dist/ (also copies dist/style.css)
```

## Before you open a PR

- [ ] `npm run typecheck` passes
- [ ] `npm test` passes
- [ ] `npm run build` passes
- [ ] Added/updated unit tests for the change (real component behavior — this repo tests with
  `vitest` + `@testing-library/vue`, not shallow rendering)
- [ ] Updated the README's Features list if the public API changed
- [ ] If you touched core logic (sorting, filtering, aggregation, export, i18n), check whether the
  same change applies to the [Angular](https://github.com/inandusolutions/inandu-grid) and
  [React](https://github.com/inandusolutions/inandu-grid-react) versions — the cores are kept in
  sync by hand, not shared via a package

## Commit messages

[Conventional Commits](https://www.conventionalcommits.org/) — `feat:`, `fix:`, `docs:`, `chore:`,
etc. Keep the subject line under ~72 characters; explain the *why* in the body when it's not obvious.

## Pull requests

Fill in the PR template. Small, focused PRs are easier to review than one that bundles several
unrelated changes — split them if you can.

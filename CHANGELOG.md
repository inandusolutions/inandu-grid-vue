# Changelog

All notable changes to **@inandu-solutions/grid-vue** are documented here.
The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and the
project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

Releases up to 0.2.2 are listed on the [GitHub Releases](https://github.com/inandusolutions/inandu-grid-vue/releases) page;
entries below start from the next release.

## [Unreleased]

## [0.2.3] - 2026-11-04

### Accessibility

- Column headers expose `aria-sort` (`ascending` / `descending` / `none`).
- Data rows expose `aria-selected` when the grid is `selectable`.
- With `pageSize`, `virtualScroll` or `serverSide`, the table exposes `aria-rowcount` (both header rows
  included), so assistive technology can say "row 3 of 240" although only a page is in the DOM.
- A visually hidden polite live region (`role="status"`) announces an empty result. The message now appears
  twice in the DOM (the visible cell and the live region): in your own tests, query it inside the table
  (`within(screen.getByRole('table'))`).

The table keeps its native `table` role on purpose: `role="grid"` promises arrow-key cell navigation, which this
grid does not implement.

[Unreleased]: https://github.com/inandusolutions/inandu-grid-vue/compare/v0.2.3...HEAD
[0.2.3]: https://github.com/inandusolutions/inandu-grid-vue/compare/v0.2.2...v0.2.3

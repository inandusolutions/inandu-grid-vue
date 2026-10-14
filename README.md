# inandu-grid-vue

**A lightweight Vue 3 data grid with the essentials other grids gate behind a paid enterprise
licence — row grouping, aggregates, inline editing and Excel-compatible export — fully MIT.** The
Vue port of [`@inandu-solutions/grid-angular`](https://github.com/inandusolutions/inandu-grid),
kept in sync feature-for-feature by hand (and with its React sibling,
[`@inandu-solutions/grid-react`](https://github.com/inandusolutions/inandu-grid-react)).

[![npm](https://img.shields.io/npm/v/@inandu-solutions/grid-vue.svg)](https://www.npmjs.com/package/@inandu-solutions/grid-vue)
[![CI](https://github.com/inandusolutions/inandu-grid-vue/actions/workflows/ci.yml/badge.svg)](https://github.com/inandusolutions/inandu-grid-vue/actions/workflows/ci.yml)
[![license](https://img.shields.io/npm/l/@inandu-solutions/grid-vue.svg)](LICENSE)
![Vue](https://img.shields.io/badge/Vue-3.4%2B-42b883)
[![live demo](https://img.shields.io/badge/demo-live-1a8fae)](https://inandusolutions.github.io/inandu-grid-vue/)
[![Open in StackBlitz](https://img.shields.io/badge/StackBlitz-open%20example-1389FD?logo=stackblitz&logoColor=white)](https://stackblitz.com/github/inandusolutions/inandu-grid-vue/tree/main/examples/stackblitz)

## Try it in 30 seconds

```bash
npm install @inandu-solutions/grid-vue
```

```vue
<script setup lang="ts">
import { InanduGrid, type InanduGridColumn } from '@inandu-solutions/grid-vue';
import '@inandu-solutions/grid-vue/style.css';

const rows = [{ name: 'Ada', age: 36 }, { name: 'Alan', age: 41 }];
const columns: InanduGridColumn[] = [{ field: 'name', headerText: 'Name' }, { field: 'age', headerText: 'Age', type: 'number' }];
</script>

<template>
  <!-- sorting + filtering are on by default -->
  <InanduGrid :rows="rows" :columns="columns" :page-size="25" />
</template>
```

- **▶️ [Live demo](https://inandusolutions.github.io/inandu-grid-vue/)** — try every feature in the browser.
- **⚡ [Edit in StackBlitz](https://stackblitz.com/github/inandusolutions/inandu-grid-vue/tree/main/examples/stackblitz)** —
  installs `@inandu-solutions/grid-vue` from npm; edit `src/App.vue` and it updates live ([source](examples/stackblitz)).
- **📦 [`@inandu-solutions/grid-vue` on npm](https://www.npmjs.com/package/@inandu-solutions/grid-vue)**
  (MIT) — `0.x` while the API settles; expect breaking changes between minors until `1.0.0`.

## Who is this for?

- **CRUD / business apps** that need sortable, filterable, editable tables without pulling in a
  full enterprise grid framework.
- **Admin dashboards** that need grouping, aggregates and CSV/Excel/PDF export out of the box.
- **Data-heavy Vue apps** that need virtual scroll, or server-side sort / filter / paging against a
  backend (see [Server-side data](#server-side-data)), without the bundle size of a kitchen-sink grid.

**When not to use it:** if you need pivot tables or integrated charting built into the grid itself,
this isn't that — see [Not included](#not-included) below.

## Angular and React versions

[`inandu-grid`](https://github.com/inandusolutions/inandu-grid) is the original, feature-complete,
MIT-licensed Angular grid this repo is ported from, and
[`inandu-grid-react`](https://github.com/inandusolutions/inandu-grid-react) is its React port — same
feature set, same core logic, adapted for Vue's composition API (`computed`/`shallowRef`, SFCs,
scoped slots, emitted events) instead of Angular signals or React hooks.

## Not included

Deliberately *not* a kitchen sink: no pivoting and no integrated charts — those stay out of scope
so the core stays small and auditable. Everything else on this page (grouping, aggregates, editing,
export, virtual scroll, paged server-side mode) is included, free, no enterprise tier.

## Commercial add-ons

`@inandu-solutions/grid-pro-vue` *(private, paid, not released yet)* — the Vue port of
`@inandu-solutions/grid-pro`, depends on this package the same way grid-pro depends on grid-angular.

## Features

**Feature-complete with grid-angular and grid-react.** The framework-agnostic core (sorting,
filtering, aggregation, export, i18n) is ported from grid-angular's
[`core/`](https://github.com/inandusolutions/inandu-grid/tree/main/projects/inandu-grid/src/lib/core)
folder and kept in sync by hand across the three repos. The Vue-specific layer — the
[`<InanduGrid>`](#api-shape) component and the [`useInanduGrid()`](#api-shape) headless
composable — covers:

- Sorting — single-column, or multi-column via shift-click
- Free-text search and per-column filtering, plus an `extra-row-filter` escape hatch for your own predicates
- Pagination, single-column grouping with aggregates, row selection
- CSV / Excel (`.xls`) / PDF export, and print
- i18n — 5 built-in languages via a `lang` prop
- Inline row editing, creation and deletion, with validation (required / min / max / pattern / custom / async)
- Excel-style Ctrl+C / Ctrl+V clipboard copy/paste
- Runtime column show/hide, sticky (pinned left/right) columns, drag-reorder
- Column resize (drag a header's handle) and autosize (double-click it to fit content)
- Row drag-reorder
- Tree data (`tree-children-key`) — display and expand only, no inline editing/drag/clipboard on
  tree rows, same restriction as grid-angular
- Master-detail — a `#detail="{ row }"` slot (or a `renderDetail` render-function prop)
- Custom cell / header / edit-control rendering per column — `#cell-<field>`, `#header-<field>` and
  `#editor-<field>` scoped slots, or `renderCell` / `renderHeader` / `renderEditor` render functions
  on the column definition — without losing sorting, resizing, or validation
- Excel-style cell range selection (`cell-range-selection`, `multi-range`) — click-and-drag or
  shift-click across cells to select a rectangular block; `Ctrl+C` copies the whole range as TSV
  when `clipboard` is also on
- Row virtualization (`virtual-scroll`) for large datasets
- Server-side sort / search / filter / paging (`server-side` + `useInanduGridServer`) — paged only;
  grid-angular's server-side infinite scroll isn't ported. See [Server-side data](#server-side-data)

Two things work slightly differently from grid-angular because they need a real browser layout
engine that a unit-test environment can't provide: virtual scroll's row height isn't
auto-measured — pass `virtual-row-height` explicitly — and autosize's content measurement itself is
trusted (ported verbatim, same DOM APIs) rather than end-to-end tested; see
[`measureColumn.ts`](src/utils/measureColumn.ts)'s doc comment for exactly what its test suite does
and doesn't cover.

## API shape

```vue
<script setup lang="ts">
import { useTemplateRef } from 'vue';
import { InanduGrid, useInanduGrid, type InanduGridRowSave } from '@inandu-solutions/grid-vue';
import '@inandu-solutions/grid-vue/style.css'; // optional default styling — skip it and bring your own

// Component: batteries-included table. The grid never mutates `rows` — events hand you the change.
function onRowSave({ row, values }: InanduGridRowSave) {
  rows.value = rows.value.map(r => (r === row ? { ...r, ...values } : r));
}

// Its headless engine is exposed on a template ref, for programmatic control.
const gridRef = useTemplateRef('grid');
const sortByName = () => gridRef.value?.grid.toggleSort('name');

// Composable: headless — bring your own markup. Pass a getter to follow reactive data; every
// piece of state is a reactive getter (`headless.visibleRows`, no `.value`).
const headless = useInanduGrid(() => ({ rows: rows.value, columns, pageSize: 25 }));
</script>

<template>
  <InanduGrid ref="grid" :rows="rows" :columns="columns" selectable @row-save="onRowSave" @selection-change="selected = $event">
    <template #cell-status="{ value }"><StatusBadge :status="value" /></template>
    <template #detail="{ row }"><OrderLines :order="row" /></template>
  </InanduGrid>
</template>
```

Events: `selection-change`, `row-save`, `row-create`, `row-delete`, `rows-delete`, `cells-paste`,
`row-order-change`, `cell-range-change`, `cell-ranges-change`.

## Server-side data

For tables too big to load whole, let the backend sort, filter and page, and keep the grid's UI
unchanged:

```vue
<script setup lang="ts">
import { InanduGrid, useInanduGridServer } from '@inandu-solutions/grid-vue';

const server = useInanduGridServer({ url: '/api/products' });
</script>

<template>
  <InanduGrid
    :rows="server.rows.value"
    :columns="columns"
    :page-size="25"
    :server-side="{ totalItems: server.total.value }"
    @query-change="server.setQuery"
  />
</template>
```

`useInanduGridServer` turns the grid's page / sort / search / column filters into a query string
(`?page=2&pageSize=25&sort=-price&q=cable&price_gte=20`), aborts superseded requests, debounces typing,
and keeps the previous page on screen while the next loads. It expects `{ data: [...], total: n }`.
That is exactly what [`Inandu.Grid.Extensions`](https://github.com/inandusolutions/inandu-grid-extensions)
(.NET / EF Core) returns from one `ToInanduGrid()` call — [request contract](https://github.com/inandusolutions/inandu-grid-extensions/blob/main/docs/request-contract.md) —
but any backend that speaks the same params works. Runnable example: [`examples/server-side`](examples/server-side).

In `serverSide` mode grouping, tree data, virtual scroll, `extraRowFilter` and column aggregate
totals are off (they would only ever see one page), and a column's Excel-style value checklist lists
the values on the current page. Use `buildInanduGridQuery(query)` if you'd rather do the fetching
yourself, and `fetcher` / `init` on the composable for auth headers or a custom client.

## Development

```bash
npm install
npm test           # Vitest + Vue Testing Library
npm run typecheck  # vue-tsc --noEmit
npm run build      # library build (dist/)
```

## Contributing

Issues and PRs welcome. Please read [`CONTRIBUTING.md`](CONTRIBUTING.md) first, and note the
[Code of Conduct](.github/CODE_OF_CONDUCT.md). Security reports: [`.github/SECURITY.md`](.github/SECURITY.md).

## License

MIT © [Inandu SAS](https://www.inandu.com/)

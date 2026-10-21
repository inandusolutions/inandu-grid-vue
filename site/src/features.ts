export type DemoTab = 'basics' | 'editing' | 'tree' | 'virtual' | 'slots';
export type Tone = 'teal' | 'green' | 'amber' | 'violet' | 'rose' | 'blue';

export interface Feature {
  id: string;
  title: string;
  blurb: string;
  tone: Tone;
  /** Key into the ICONS map in FeatureExplorer.vue. */
  icon: string;
  code: string;
  /** Demo tab that shows this feature running, when there is one. */
  demo?: DemoTab;
  /** README anchor on GitHub. */
  doc: string;
}

const README = 'https://github.com/inandusolutions/inandu-grid-vue#';
export const readme = (anchor: string) => README + anchor;

// Snippets are the real prop / event / slot names — keep them in sync with src/components/InanduGrid.vue.
export const FEATURES: Feature[] = [
  {
    id: 'sort-filter',
    title: 'Sorting & filtering',
    blurb:
      'Click a header to sort, shift-click for a second column. Free-text search covers every column, and each column gets a filter control that matches its type. Need your own rule? Layer a predicate on top.',
    tone: 'teal',
    icon: 'sort',
    demo: 'basics',
    doc: 'features',
    code: `<InanduGrid
  :rows="rows"
  :columns="columns"
  :page-size="25"
  :extra-row-filter="row => row.active"
/>`,
  },
  {
    id: 'grouping',
    title: 'Grouping & aggregates',
    blurb:
      'Group by any column and get live sum / avg / min / max / count per group, plus grand totals. Declare the aggregate once on the column — no extra wiring.',
    tone: 'green',
    icon: 'layers',
    demo: 'basics',
    doc: 'features',
    code: `const columns: InanduGridColumn[] = [
  { field: 'team', headerText: 'Team' },
  { field: 'salary', headerText: 'Salary', type: 'number',
    format: '1.0-0', aggregate: 'avg' },
];
// then pick "Team" in the grid's group-by control`,
  },
  {
    id: 'export',
    title: 'CSV / Excel / PDF export',
    blurb:
      'One flag adds a toolbar that exports exactly the rows you are looking at. jspdf is lazy-loaded, so the PDF path costs nothing until someone clicks it.',
    tone: 'amber',
    icon: 'download',
    demo: 'basics',
    doc: 'features',
    code: `<InanduGrid
  :rows="rows"
  :columns="columns"
  exportable   <!-- CSV, Excel (.xls), PDF and Print -->
/>`,
  },
  {
    id: 'editing',
    title: 'Inline editing & validation',
    blurb:
      'Mark columns editable and the grid handles edit, create and delete. Required / min / max / pattern, a custom validator and async validators all run at save time. The grid never mutates your rows — events hand you the change.',
    tone: 'violet',
    icon: 'pencil',
    demo: 'editing',
    doc: 'api-shape',
    code: `const columns: InanduGridColumn[] = [
  { field: 'name', editable: true, required: true },
  { field: 'salary', type: 'number', editable: true, min: 0 },
];

<InanduGrid :rows="rows" :columns="columns" creatable deletable
  @row-save="({ row, values }) => update(row, values)" />`,
  },
  {
    id: 'columns',
    title: 'Columns, your way',
    blurb:
      'Resize by dragging, autosize with a double-click, drag headers to reorder, pin columns left or right, and let users show or hide columns at runtime.',
    tone: 'blue',
    icon: 'columns',
    demo: 'basics',
    doc: 'features',
    code: `const columns: InanduGridColumn[] = [
  { field: 'name', pinned: 'left', width: 180 },
  { field: 'team', hideable: false },
  { field: 'salary', reorder: false },
];

<InanduGrid :columns="columns" column-toggle autosize />`,
  },
  {
    id: 'range',
    title: 'Range selection & clipboard',
    blurb:
      'Click and drag across cells to select a block, hold Ctrl or shift for more ranges, and copy the whole selection as TSV straight into Excel. Paste works too.',
    tone: 'rose',
    icon: 'grid',
    doc: 'features',
    code: `<InanduGrid
  :rows="rows"
  :columns="columns"
  cell-range-selection
  multi-range
  clipboard
  @cell-range-change="onRange"
/>`,
  },
  {
    id: 'virtual',
    title: 'Virtual scroll',
    blurb:
      'Render only the rows in view, so ten thousand rows scroll as smoothly as ten. Give it a fixed row height and a viewport height and you are done.',
    tone: 'green',
    icon: 'zap',
    demo: 'virtual',
    doc: 'features',
    code: `<InanduGrid
  :rows="tenThousandRows"
  :columns="columns"
  virtual-scroll
  :virtual-row-height="40"
  :height="400"
/>`,
  },
  {
    id: 'server',
    title: 'Server-side data',
    blurb:
      'Let the backend sort, filter and page. The composable turns grid state into a query string, aborts superseded requests, debounces typing and keeps the previous page on screen while the next one loads.',
    tone: 'amber',
    icon: 'server',
    doc: 'server-side-data',
    code: `const server = useInanduGridServer({ url: '/api/products' });

<InanduGrid
  :rows="server.rows.value"
  :columns="columns"
  :page-size="25"
  :server-side="{ totalItems: server.total.value }"
  @query-change="server.setQuery"
/>`,
  },
  {
    id: 'slots',
    title: 'Slots & master-detail',
    blurb:
      'Replace any cell, header or editor with your own component through scoped slots — sorting, resizing and validation keep working. Add an expandable detail row with one more slot.',
    tone: 'violet',
    icon: 'puzzle',
    demo: 'slots',
    doc: 'api-shape',
    code: `<InanduGrid :rows="rows" :columns="columns">
  <template #cell-status="{ value }">
    <StatusBadge :status="value" />
  </template>
  <template #detail="{ row }">
    <OrderLines :order="row" />
  </template>
</InanduGrid>`,
  },
  {
    id: 'tree',
    title: 'Tree data',
    blurb:
      'Point the grid at the key that holds each row’s children and it renders an expandable tree. Start collapsed, or expand everything with one value.',
    tone: 'teal',
    icon: 'tree',
    demo: 'tree',
    doc: 'features',
    code: `const rows = [
  { name: 'Grace Hopper', reports: [
    { name: 'Ada Lovelace', reports: [/* … */] },
  ] },
];

<InanduGrid :rows="rows" :columns="columns"
  tree-children-key="reports" tree-default-expanded="all" />`,
  },
  {
    id: 'i18n',
    title: 'i18n',
    blurb:
      'English, Spanish, French, Italian and Chinese are bundled. Switch with one prop — labels, filter placeholders, export buttons and validation messages all follow.',
    tone: 'blue',
    icon: 'globe',
    doc: 'features',
    code: `<InanduGrid :rows="rows" :columns="columns" lang="es" />

<!-- en · es · fr · it · zh -->`,
  },
  {
    id: 'headless',
    title: 'Headless composable',
    blurb:
      'Want your own markup? useInanduGrid() gives you the whole engine — sorted, filtered, grouped, paged rows and every action — as reactive state, with no DOM attached.',
    tone: 'rose',
    icon: 'code',
    doc: 'api-shape',
    code: `const headless = useInanduGrid(() => ({
  rows: rows.value,
  columns,
  pageSize: 25,
}));

headless.visibleRows;        // the current page, already sorted + filtered
headless.toggleSort('name'); // drive it from your own UI`,
  },
];

<script setup lang="ts">
import { computed, onBeforeUnmount, shallowRef, useSlots, watch, type CSSProperties, type VNodeChild } from 'vue';
import type { InanduGridColumnFilterValue, InanduGridRow, InanduGridStatePart } from '../core';
import { AGGREGATE_SYMBOLS, formatCellValue, MAX_COLUMN_WIDTH } from '../core';
import {
  useInanduGrid,
  type InanduCellRenderContext,
  type InanduEditRenderContext,
  type InanduGridCellPaste,
  type InanduGridColumn,
  type InanduGridRowSave,
  type InanduGridServerQuery,
  type InanduGridSort,
  type InanduHeaderRenderContext,
} from '../composables/useInanduGrid';
import { exportCsv, exportExcel, exportPdf, printTable } from '../utils/exporters';
import { measureColumnContentWidth } from '../utils/measureColumn';
import { createTranslator } from '../utils/translate';
import DataRow from './DataRow.vue';
import EditCell from './EditCell.vue';
import FilterControl from './FilterControl.vue';
import { RenderNodes, type RowContext } from './internal';
import type { InanduGridCellRangeSelection } from './types';
import type { InanduGridRowId } from '../composables/rowKey';

/** An inclusive rectangle in `visibleRows`/`visibleColumns` coordinates. */
interface RangeRect {
  minRow: number;
  maxRow: number;
  minCol: number;
  maxCol: number;
}

function normalizeRange(anchor: { row: number; col: number }, focus: { row: number; col: number }): RangeRect {
  return {
    minRow: Math.min(anchor.row, focus.row),
    maxRow: Math.max(anchor.row, focus.row),
    minCol: Math.min(anchor.col, focus.col),
    maxCol: Math.max(anchor.col, focus.col),
  };
}

function isRectHit(rect: RangeRect, rowIndex: number, colIndex: number): boolean {
  return rowIndex >= rect.minRow && rowIndex <= rect.maxRow && colIndex >= rect.minCol && colIndex <= rect.maxCol;
}

/**
 * Batteries-included table over `useInanduGrid`: sorting, free-text search, a per-column filter
 * row, pagination, single-column grouping with per-group + grand-total aggregates, row selection,
 * CSV/Excel/PDF export, i18n, inline row editing/creation/deletion with validation, and row
 * virtualization for large datasets.
 */
defineOptions({ name: 'InanduGrid' });

const props = withDefaults(
  defineProps<{
    rows: InanduGridRow[];
    columns: InanduGridColumn[];
    /** Drives number/date formatting (`Intl`-based). Default: 'en'. */
    locale?: string;
    /** Drives built-in UI string translation (one of `INANDU_GRID_TRANSLATIONS`'s keys). Default: `locale`'s primary subtag. */
    lang?: string;
    /** 0 (default) disables pagination — every filtered/sorted row renders. Ignored while grouped. */
    pageSize?: number;
    /** Adds a checkbox column with row + select-all selection. Default: false. */
    selectable?: boolean;
    /** Adds a CSV/Excel/PDF export toolbar above the table. Default: false. */
    exportable?: boolean;
    /** Base filename (without extension) for exports. Default: 'inandu-grid'. */
    exportFilenameBase?: string;
    /** Adds a per-row "Delete" button. Default: false. */
    deletable?: boolean;
    /** `window.confirm()`-gates a single row's delete. Unset: deletes immediately. */
    deleteConfirmMessage?: string;
    /** `window.confirm()`-gates the "Delete selected" bulk action (shown when `selectable && deletable` with at least one row selected). Unset: deletes immediately. */
    bulkDeleteConfirmMessage?: string;
    /** Adds an "Add row" trigger with a blank draft row. Default: false. Has no effect unless at least one column is `editable`. */
    creatable?: boolean;
    /** Opts into `Ctrl+C`/`Ctrl+V` cell copy/paste (Excel-style TSV). Default: false. */
    clipboard?: boolean;
    /**
     * Opt-in Excel-style range selection — click-and-drag (or shift-click, without dragging) across
     * cells in the flat, non-grouped, non-tree, non-virtualized render path (same restriction
     * `rowReorder`/`clipboard` already document) selects a rectangular block of cells, highlighted via
     * `.inandu-cell-range-selected`. Off by default. When `clipboard` is *also* on, `Ctrl+C` copies
     * the *entire* selected range as TSV instead of just the focused cell — otherwise this is purely a
     * selection/highlight feature with no built-in side effect; the `cell-range-change`/
     * `cell-ranges-change` events are how a consumer observes what's currently selected.
     */
    cellRangeSelection?: boolean;
    /**
     * Lets a Ctrl/Cmd-drag (or Ctrl/Cmd-click) *add* another rectangle to the selection instead of
     * replacing it, the same convention spreadsheets use. A plain click still resets to one
     * rectangle. Only meaningful with `cellRangeSelection` on. `cell-range-change` keeps reporting
     * the *active* (last) rectangle; `cell-ranges-change` reports the whole list. `Ctrl+C` copies
     * only the active rectangle. Default: false.
     */
    multiRange?: boolean;
    /** Adds a "Columns" toolbar button + popup letting the user show/hide individual columns at runtime. Default: false. */
    columnToggle?: boolean;
    /** Adds a per-row drag handle to reorder rows. Default: false. Auto-disabled while grouped, same as grid-angular. */
    rowReorder?: boolean;
    /**
     * Turns on tree mode: the field on each row holding its child rows (a nested array of the same
     * shape). `rows` is then the root rows. Auto-disabled while grouped. Tree rows are display +
     * expand only — inline editing, drag-reorder and clipboard don't apply to them, same as
     * grid-angular.
     */
    treeChildrenKey?: string;
    /** Initial expand state for tree mode. Default: `'none'`. */
    treeDefaultExpanded?: 'none' | 'all' | number;
    /**
     * Enables master-detail as a render function: renders a leading expand/collapse toggle per row,
     * and (while expanded) a full-width detail row right below it, with whatever this returns. The
     * `#detail="{ row }"` slot does the same template-side (and wins when both are set). Auto-disabled
     * while grouped, same as grid-angular's `detailTemplate`/`hasMasterDetail`. Unset (default): off.
     */
    renderDetail?: (row: InanduGridRow) => VNodeChild;
    /** Collapses any other expanded row first, accordion-style, when a new one expands. Off (any number of rows can be expanded at once) by default. */
    singleDetailExpand?: boolean;
    /** An extra per-row predicate ANDed onto the free-text + column filters — same as grid-angular's `extraRowFilter`. Lets a caller layer its own filtering (e.g. an advanced-filter query) on top of the grid's own. Unset: no extra filtering. Keep the function's identity stable (declare it once, or wrap it in `computed`): a new function on every parent render re-filters and re-sorts all rows each time. */
    extraRowFilter?: (row: InanduGridRow) => boolean;
    /**
     * How a row is identified across data refreshes: a field name (`'sku'`) or a function returning the key.
     * Selection, tree and detail expansion are remembered by it, so they survive a server-side page change or
     * `reload()` and a parent that passes a derived array; it is also the `:key` of the row. Unset: the row's
     * `id` field when it has one, otherwise the row object itself (identity), as before.
     */
    rowId?: InanduGridRowId;
    /** Server-side mode: `rows` is the current page as sorted/filtered/paged by the server and `totalItems` is the full match count. See `useInanduGridServer`. Needs `pageSize` > 0. */
    serverSide?: { totalItems: number };
    /**
     * Opt-in row virtualization for large datasets — only rows scrolled into view (plus a small
     * overscan runway) are actually mounted. Bypasses pagination entirely, same as grouping.
     * Auto-disabled while grouped (this port doesn't interleave group headers into the virtualized
     * window the way grid-angular does); also disables master-detail, row drag-reorder, tree data,
     * and the totals `<tfoot>`, same restrictions grid-angular's `virtualScroll` has. Default: false.
     */
    virtualScroll?: boolean;
    /**
     * Fixed row height (px) the virtualization math uses to compute scroll position and how many
     * rows to render. Unlike grid-angular, this port doesn't auto-measure a rendered row's real
     * height — pass the actual rendered row height for correct scrolling. Default: 40.
     */
    virtualRowHeight?: number;
    /** The scrollable viewport's own height (px) — only used while `virtualScroll`. Default: 400. */
    height?: number;
    /** Extra rows rendered above/below the visible window, so a fast scroll doesn't flash empty space before the next render catches up. Default: 4. */
    overscan?: number;
    /**
     * Double-click a column's resize handle to fit its width to its widest currently-rendered value
     * (header included). Measures real rendered text width via the DOM (`measureColumnContentWidth`)
     * — like grid-angular's own autosize, this only measures what's actually mounted (one page, or
     * the virtual window), not the full dataset. Default: false.
     */
    autosize?: boolean;
    /** Shows a loading row in place of the data rows (and disables the export/print toolbar) while `true`. Default: false. */
    loading?: boolean;
    /** Shows this message in place of the data rows (and disables the export/print toolbar) when non-empty. Shown verbatim: translate it yourself. Wins over `loading`. */
    error?: string;
    /** Text direction of the grid. Default: `'ltr'`. */
    dir?: 'ltr' | 'rtl' | 'auto';
    /** Adds an `inandu-theme-{theme}` class to the root (`'material'`, `'dark'` and `'minimal'` are built in; any other name needs your own CSS). */
    theme?: string;
    /** The `id` of the root element; also the default base filename of the exports. */
    id?: string;
    /** Fixed width (px) of the root element. Unset: the container's width. */
    width?: number;
    /** Shows the search box. Default: true (grid-angular's is opt-in). */
    filter?: boolean;
    /** Placeholder of the search box. Default: the translated one. */
    filterPlaceholder?: string;
    /** Shows the totals footer for the columns with an `aggregate`. Default: true (grid-angular's is opt-in). */
    showTotals?: boolean;
    /** Overrides built-in texts per language: `{ es: { MsgNoData: 'Nada' } }`. Merged over the built-in dictionary. */
    customTranslations?: Record<string, Record<string, string>>;
    /** Saves column widths/order/visibility/pins, sort and filters to `localStorage` under this key and restores them on mount. See `useInanduGrid`. */
    stateKey?: string;
    /** Which parts of the state `stateKey` saves; all by default. Leave out `'filterQuery'` and `'columnFilters'` to keep typed text out of storage. */
    persist?: readonly InanduGridStatePart[];
    /** Rows shown above the data rows, outside of filtering, sorting, paging and totals (a summary row you computed yourself). Read-only. */
    pinnedTopRows?: InanduGridRow[];
    /** Rows shown below the data rows, with the same rules as `pinnedTopRows`. */
    pinnedBottomRows?: InanduGridRow[];
  }>(),
  {
    locale: 'en',
    pageSize: 0,
    exportFilenameBase: undefined,
    loading: false,
    error: '',
    dir: 'ltr',
    theme: '',
    filter: true,
    showTotals: true,
    pinnedTopRows: () => [],
    pinnedBottomRows: () => [],
    treeDefaultExpanded: 'none',
    virtualRowHeight: 40,
    height: 400,
    overscan: 4,
  },
);

const emit = defineEmits<{
  /** `serverSide` only: on setup and whenever page, sort, filters or search change — feed it to `useInanduGridServer().setQuery`. */
  queryChange: [query: InanduGridServerQuery];
  /** After every selection change, with the current full selection as an array (also once on mount). */
  selectionChange: [selectedRows: InanduGridRow[]];
  /** A row edit passed validation. The grid never mutates `rows` itself — applying `values` onto `row` is the caller's job. */
  rowSave: [event: InanduGridRowSave];
  /** A new row's draft passed validation. No row reference — it doesn't exist in `rows` yet. */
  rowCreate: [values: Record<string, unknown>];
  /** A single-row delete was confirmed (or clicked, if no `deleteConfirmMessage`). */
  rowDelete: [row: InanduGridRow];
  /** The bulk "Delete selected" action was confirmed (or clicked, if no `bulkDeleteConfirmMessage`). */
  rowsDelete: [rows: InanduGridRow[]];
  /** Every parsed cell update from a `Ctrl+V`. The grid never mutates `rows` itself. */
  cellsPaste: [updates: InanduGridCellPaste[]];
  /** The selected range's rows/fields on every change, or `undefined` once cleared. With `multiRange` on this is the *active* (last) rectangle. */
  cellRangeChange: [selection: InanduGridCellRangeSelection | undefined];
  /** Every selected rectangle (active one last), or `[]` once cleared — see `multiRange`. */
  cellRangesChange: [selections: InanduGridCellRangeSelection[]];
  /** The fully reordered row array after a row drag-and-drop. The grid never mutates `rows` itself. */
  rowOrderChange: [rows: InanduGridRow[]];
  /** The sort changed (not emitted on mount). An empty array means "no sort". */
  sortChange: [criteria: InanduGridSort[]];
  /** The search text or a column filter changed (not emitted on mount). */
  filterChange: [state: { query: string; columnFilters: Record<string, InanduGridColumnFilterValue> }];
  /** The page changed (not emitted on mount). `page` is 0-based. */
  pageChange: [state: { page: number; pageSize: number }];
}>();

defineSlots<{
  /** Custom cell content for column `<field>`: `#cell-name="{ value, row, field }"`. */
  [key: `cell-${string}`]: (ctx: InanduCellRenderContext) => VNodeChild;
  /** Custom header label for column `<field>`: `#header-name="{ title, field }"`. */
  [key: `header-${string}`]: (ctx: InanduHeaderRenderContext) => VNodeChild;
  /** Custom editor for editable column `<field>`: `#editor-name="{ value, setValue, error, row, field }"`. */
  [key: `editor-${string}`]: (ctx: InanduEditRenderContext) => VNodeChild;
  /** Master-detail content for an expanded row — its presence turns master-detail on. */
  detail?: (ctx: { row: InanduGridRow }) => VNodeChild;
}>();

const slots = useSlots();

const grid = useInanduGrid(() => ({
  rows: props.rows,
  columns: props.columns,
  locale: props.locale,
  lang: props.lang,
  pageSize: props.pageSize,
  selectable: props.selectable,
  deleteConfirmMessage: props.deleteConfirmMessage,
  bulkDeleteConfirmMessage: props.bulkDeleteConfirmMessage,
  onRowSave: event => emit('rowSave', event),
  onRowCreate: values => emit('rowCreate', values),
  onRowDelete: row => emit('rowDelete', row),
  onRowsDelete: rows => emit('rowsDelete', rows),
  onCellsPaste: updates => emit('cellsPaste', updates),
  onRowOrderChange: rows => emit('rowOrderChange', rows),
  treeChildrenKey: props.treeChildrenKey,
  treeDefaultExpanded: props.treeDefaultExpanded,
  singleDetailExpand: props.singleDetailExpand,
  extraRowFilter: props.extraRowFilter,
  rowId: props.rowId,
  virtualScroll: props.virtualScroll,
  serverSide: props.serverSide,
  onQueryChange: query => emit('queryChange', query),
  stateKey: props.stateKey,
  persist: props.persist,
}));

/** The headless engine driving this grid — the same object `useInanduGrid()` returns — so a parent holding a template ref can sort/filter/pin/export programmatically or hand it to a grid-pro add-on. */
defineExpose({ grid });

const t = computed(() => createTranslator(props.lang ?? props.locale, props.customTranslations));
const exportBase = computed(() => props.exportFilenameBase ?? (props.id || 'inandu-grid'));
const dragOverField = shallowRef<string | undefined>(undefined);
const dragOverRow = shallowRef<InanduGridRow | undefined>(undefined);
const scrollTop = shallowRef(0);
const tableRef = shallowRef<HTMLTableElement | null>(null);

// sort / filter / page notifications: only on a change, never for the initial state.
watch(() => grid.sortCriteria, criteria => emit('sortChange', criteria));
watch([() => grid.filterQuery, () => grid.filterValues], ([query, columnFilters]) => emit('filterChange', { query, columnFilters }));
watch(() => grid.page, page => emit('pageChange', { page, pageSize: props.pageSize }));

watch(
  () => grid.selectedRows,
  selected => emit('selectionChange', Array.from(selected)),
  { immediate: true },
);

// The resize handle's drag: mousemove/mouseup are tracked on `window` (not the handle itself),
// since the pointer routinely leaves the handle and even the table while dragging — same reason
// grid-angular's own onResizeHandleMouseDown attaches its listeners there instead.
let stopResizing: (() => void) | undefined;

function onResizeMouseDown(event: MouseEvent, field: string) {
  event.preventDefault();
  stopResizing?.();
  const startX = event.clientX;
  const startWidth = grid.effectiveWidth(field);
  const onMouseMove = (moveEvent: MouseEvent) => grid.setColumnWidth(field, startWidth + (moveEvent.clientX - startX));
  const onMouseUp = () => stopResizing?.();
  window.addEventListener('mousemove', onMouseMove);
  window.addEventListener('mouseup', onMouseUp);
  stopResizing = () => {
    window.removeEventListener('mousemove', onMouseMove);
    window.removeEventListener('mouseup', onMouseUp);
    stopResizing = undefined;
  };
}

/** Double-click on a resize handle → fit the column to its content. Ported from grid-angular's `onResizeHandleDblClick`. */
function onResizeDoubleClick(event: MouseEvent, column: InanduGridColumn) {
  if (!props.autosize || !tableRef.value) return;
  event.preventDefault();
  event.stopPropagation();
  const width = measureColumnContentWidth(tableRef.value, column.field, column.headerText ?? column.field);
  if (width > 0) grid.setColumnWidth(column.field, Math.min(MAX_COLUMN_WIDTH, width));
}

// ── Excel-style cell range selection (`cellRangeSelection`) ──
// Only meaningful in the flat, non-grouped, non-tree, non-virtualized render path — same
// restriction `rowReorder`/`clipboard` already document.
const hasCellRangeSelection = computed(() => props.cellRangeSelection && !grid.groupByField && !grid.hasVirtualScroll && !grid.hasTreeData);
// The cell a range drag/shift-click started from — fixed for the duration of one selection gesture.
const rangeAnchor = shallowRef<{ row: number; col: number } | undefined>(undefined);
// The cell a range drag/shift-click currently extends to — this is the corner that moves as the gesture continues.
const rangeFocus = shallowRef<{ row: number; col: number } | undefined>(undefined);
// Rectangles frozen by an earlier Ctrl-drag while `multiRange` is on — the active one is `selectedRange` below.
const committedRanges = shallowRef<RangeRect[]>([]);
// Whether a mouse-drag range selection is in progress — plain state (not reactive) since only event handlers read it.
let isSelectingRange = false;

const selectedRange = computed<RangeRect | undefined>(() =>
  rangeAnchor.value && rangeFocus.value ? normalizeRange(rangeAnchor.value, rangeFocus.value) : undefined,
);
const allRanges = computed(() => (selectedRange.value ? [...committedRanges.value, selectedRange.value] : committedRanges.value));

function isCellInRange(rowIndex: number, colIndex: number): boolean {
  return allRanges.value.some(r => isRectHit(r, rowIndex, colIndex));
}

function rangeToSelection(r: RangeRect): InanduGridCellRangeSelection {
  return {
    rows: grid.visibleRows.slice(r.minRow, r.maxRow + 1),
    fields: grid.visibleColumns.slice(r.minCol, r.maxCol + 1).map(column => column.field),
  };
}

// Reports the active range and the full range list on every change, including the transition to
// "nothing selected" — the Vue stand-in for grid-angular's per-gesture `emit` calls.
watch(
  [hasCellRangeSelection, allRanges, () => grid.visibleRows, () => grid.visibleColumns],
  () => {
    if (!hasCellRangeSelection.value) return;
    emit('cellRangeChange', selectedRange.value ? rangeToSelection(selectedRange.value) : undefined);
    emit('cellRangesChange', allRanges.value.map(rangeToSelection));
  },
  { immediate: true },
);

/** Starts a new range selection gesture — a plain click resets to this cell; shift-click extends the *existing* anchor; Ctrl/Cmd-click (with `multiRange`) freezes the current rectangle and starts another. */
function onCellRangeMouseDown(event: MouseEvent, rowIndex: number, colIndex: number) {
  if (event.button !== 0) return;
  isSelectingRange = true;
  const additive = props.multiRange && (event.ctrlKey || event.metaKey) && !event.shiftKey;
  if (additive) {
    if (selectedRange.value) committedRanges.value = [...committedRanges.value, selectedRange.value];
    rangeAnchor.value = { row: rowIndex, col: colIndex };
  } else if (!event.shiftKey || !rangeAnchor.value) {
    committedRanges.value = [];
    rangeAnchor.value = { row: rowIndex, col: colIndex };
  }
  rangeFocus.value = { row: rowIndex, col: colIndex };
}

/** Extends the in-progress range to `(rowIndex, colIndex)` — a no-op while no drag is active, so merely hovering cells never starts or changes a selection. */
function onCellRangeMouseEnter(rowIndex: number, colIndex: number) {
  if (!isSelectingRange) return;
  rangeFocus.value = { row: rowIndex, col: colIndex };
}

// Ends the in-progress drag — bound at the document level (not the cell) since the mouse button
// can be released outside any cell and the drag should still stop.
const onDocumentMouseUp = () => {
  isSelectingRange = false;
};
watch(
  hasCellRangeSelection,
  (on, _, onCleanup) => {
    if (!on) return;
    document.addEventListener('mouseup', onDocumentMouseUp);
    onCleanup(() => document.removeEventListener('mouseup', onDocumentMouseUp));
  },
  { immediate: true },
);

onBeforeUnmount(() => stopResizing?.());

/** The full selected range formatted as TSV (one line per row, tab-separated columns) — what `Ctrl+C` copies when a genuine (more-than-one-cell) range is active. */
function selectedRangeText(r: RangeRect): string {
  const rangeRows = grid.visibleRows.slice(r.minRow, r.maxRow + 1);
  const rangeColumns = grid.visibleColumns.slice(r.minCol, r.maxCol + 1);
  return rangeRows
    .map(row => rangeColumns.map(column => formatCellValue(row[column.field], column.type ?? 'string', column.format ?? '', props.locale, undefined, column.timeZone)).join('\t'))
    .join('\n');
}

const aggregateColumns = computed(() => grid.visibleColumns.filter(column => column.aggregate));
const groupableColumns = computed(() => (props.serverSide ? [] : grid.visibleColumns.filter(column => column.groupable !== false))); // grouping would only see the current server page
const isEmpty = computed(() => (grid.groups ? grid.groups.length === 0 : grid.visibleRows.length === 0));

/** `aria-sort` for a column header: the direction applied to `field`, or `none`. */
function ariaSort(field: string): 'ascending' | 'descending' | 'none' {
  const direction = grid.sortDirectionFor(field);
  return direction === 'asc' ? 'ascending' : direction === 'desc' ? 'descending' : 'none';
}

/**
 * `aria-rowcount` (title row and filter row included) when the DOM holds only part of the data -
 * paged, virtual or server-side - so assistive technology can say "row 3 of 240". `undefined`
 * otherwise: the browser counts the rows that are really there.
 */
const ariaRowCount = computed(() =>
  props.serverSide || (props.pageSize > 0 && !grid.groupByField) || grid.hasVirtualScroll
    ? (props.serverSide ? props.serverSide.totalItems : grid.filteredRowCount) + 2
    : undefined,
);
const hasRowActions = computed(() => grid.editableColumns.length > 0 || props.deletable || props.creatable);
const hasRowDragHandle = computed(() => props.rowReorder && !grid.groupByField && !grid.hasVirtualScroll);
const hasMasterDetail = computed(() => (!!slots.detail || !!props.renderDetail) && !grid.groupByField && !grid.hasVirtualScroll);
const extraColumnCount = computed(
  () => (hasMasterDetail.value ? 1 : 0) + (hasRowDragHandle.value ? 1 : 0) + (props.selectable ? 1 : 0) + (hasRowActions.value ? 1 : 0),
);
const totalColumnCount = computed(() => grid.visibleColumns.length + extraColumnCount.value);

/**
 * The virtualized window: `visibleRows[windowStart, windowEnd)` is what actually mounts, plus a
 * small overscan runway on each side. `topSpacerHeight`/`bottomSpacerHeight` (rendered as one
 * `<tr>` each) stand in for the rows *not* mounted, so the container's scrollbar still reflects
 * the full, real scrollable height — same `FixedSizeVirtualScrollStrategy` assumption (a uniform
 * row height) grid-angular's own virtual scroll makes, see `virtualRowHeight`'s doc comment.
 */
const windowStart = computed(() =>
  grid.hasVirtualScroll ? Math.max(0, Math.floor(scrollTop.value / props.virtualRowHeight) - props.overscan) : 0,
);
const windowEnd = computed(() =>
  grid.hasVirtualScroll
    ? Math.min(grid.visibleRows.length, Math.ceil((scrollTop.value + props.height) / props.virtualRowHeight) + props.overscan)
    : grid.visibleRows.length,
);
const windowedRows = computed(() => (grid.hasVirtualScroll ? grid.visibleRows.slice(windowStart.value, windowEnd.value) : grid.visibleRows));
const topSpacerHeight = computed(() => windowStart.value * props.virtualRowHeight);
const bottomSpacerHeight = computed(() => (grid.visibleRows.length - windowEnd.value) * props.virtualRowHeight);

function onViewportScroll(event: Event) {
  if (grid.hasVirtualScroll) scrollTop.value = (event.currentTarget as HTMLElement).scrollTop;
}

function patchFilterValue(field: string, patch: Partial<InanduGridColumnFilterValue>) {
  grid.setFilterValue(field, { ...grid.filterValues[field], ...patch });
}

/**
 * `position: sticky` inline style + width for `column`'s `<th>`/`<td>`, per its `pinned`/
 * `effectiveWidth` — same offsets grid-angular's `stickyOffset`/`stickyOffsetRight` compute,
 * applied via CSS instead of a template class/binding. No explicit `width` unless the column
 * declared one or a resize drag set one — same as grid-angular, where an un-sized column's `<th>`/
 * `<td>` auto-sizes to content and the `?? 80` fallback is only ever used for offset/PDF math.
 */
function columnStyle(column: InanduGridColumn): CSSProperties {
  const isSized = column.width !== undefined || grid.isColumnResized(column.field);
  const style: CSSProperties = isSized ? { width: `${grid.effectiveWidth(column.field)}px` } : {};
  const pinned = grid.columnPinnedSide(column.field);
  if (pinned === 'left') return { ...style, position: 'sticky', left: `${grid.stickyOffset(column.field)}px`, zIndex: 1 };
  if (pinned === 'right') return { ...style, position: 'sticky', right: `${grid.stickyOffsetRight(column.field)}px`, zIndex: 1 };
  return style;
}

function onHeaderDragStart(event: DragEvent, field: string) {
  grid.onColumnDragStart(field);
  event.dataTransfer?.setData('text/plain', field);
}

function onHeaderDragOver(event: DragEvent, field: string) {
  event.preventDefault(); // required so the browser allows a subsequent 'drop' to fire here
  dragOverField.value = field;
}

function onHeaderDragLeave(field: string) {
  if (dragOverField.value === field) dragOverField.value = undefined;
}

function onHeaderDrop(event: DragEvent, targetField: string) {
  event.preventDefault();
  dragOverField.value = undefined;
  grid.onColumnDrop(targetField);
}

/** The select-checkbox column is always sticky-left (offset 0) when rendered — grid-angular's posture too. */
const selectColumnStyle = computed<CSSProperties | undefined>(() =>
  props.selectable ? { position: 'sticky', left: '0px', zIndex: 1 } : undefined,
);

function aggregateLabel(column: InanduGridColumn, aggregates: Record<string, number>): string {
  const kind = column.aggregate;
  const value = aggregates[column.field];
  if (!kind || value === undefined) return '';
  const formatted = kind === 'count' ? String(value) : formatCellValue(value, 'number', column.format ?? '', props.locale);
  return `${column.headerText ?? column.field} ${AGGREGATE_SYMBOLS[kind]}: ${formatted}`;
}

function headerContent(column: InanduGridColumn): VNodeChild {
  const ctx: InanduHeaderRenderContext = { title: column.headerText ?? column.field, field: column.field };
  const slot = slots[`header-${column.field}`];
  if (slot) return slot(ctx);
  if (column.renderHeader) return column.renderHeader(ctx);
  return ctx.title;
}

function cellContent(column: InanduGridColumn, row: InanduGridRow): VNodeChild {
  const ctx: InanduCellRenderContext = { value: row[column.field], row, field: column.field };
  const slot = slots[`cell-${column.field}`];
  if (slot) return slot(ctx);
  if (column.renderCell) return column.renderCell(ctx);
  return formatCellValue(row[column.field], column.type ?? 'string', column.format ?? '', props.locale, undefined, column.timeZone);
}

function editorContent(column: InanduGridColumn, row: InanduGridRow): VNodeChild | undefined {
  const slot = slots[`editor-${column.field}`];
  if (!slot && !column.renderEditor) return undefined;
  const ctx: InanduEditRenderContext = {
    value: grid.rowDraft[column.field],
    row,
    field: column.field,
    setValue: value => grid.setRowDraftValue(column.field, value),
    error: grid.fieldErrors[column.field],
  };
  return slot ? slot(ctx) : column.renderEditor!(ctx);
}

function detailContent(row: InanduGridRow): VNodeChild {
  if (slots.detail) return slots.detail({ row });
  return props.renderDetail?.(row);
}

function onColumnToggle(event: Event, field: string) {
  grid.toggleColumnVisibility(field);
  // The toggle can be refused (last visible column) — keep the checkbox truthful either way.
  (event.target as HTMLInputElement).checked = !grid.isColumnHidden(field);
}

/**
 * Keyboard model of the ARIA grid pattern, the same as grid-angular's: the grid is one tab stop (the first header cell),
 * the arrow keys move between cells (Home/End within the row, Ctrl+Home/Ctrl+End to the first/last cell, PageUp/PageDown
 * ten rows) and Enter or Space on a header cell sorts by it (Shift adds the column to the sort). Ignored while focus is
 * in a control inside a cell, so typing and arrows in an input keep working.
 */
function handleGridNavigation(event: KeyboardEvent): boolean {
  const key = event.key;
  const target = event.target as HTMLElement;
  const cell = target.closest<HTMLElement>('[role="columnheader"], [role="gridcell"]');
  if (!cell || target !== cell) return false; // focus is on a control inside the cell, not on the cell

  if ((key === 'Enter' || key === ' ') && cell.getAttribute('role') === 'columnheader') {
    const field = cell.getAttribute('data-field');
    if (!field) return false;
    event.preventDefault();
    grid.toggleSort(field, event.shiftKey);
    return true;
  }
  if (!['ArrowRight', 'ArrowLeft', 'ArrowUp', 'ArrowDown', 'Home', 'End', 'PageUp', 'PageDown'].includes(key)) return false;

  const row = cell.closest('tr');
  const table = cell.closest('table');
  if (!row || !table) return false;
  const cellsOf = (tr: Element) => Array.from(tr.querySelectorAll<HTMLElement>('[role="columnheader"], [role="gridcell"]'));
  const rows = Array.from(table.querySelectorAll<HTMLElement>('tr[role="row"]:not([aria-hidden="true"]):not(.inandu-grid-filter-row)')).filter(tr => cellsOf(tr).length > 0);
  const rowIndex = rows.indexOf(row as HTMLElement);
  const cells = cellsOf(row);
  const colIndex = cells.indexOf(cell);
  const at = (r: number, c: number) => cellsOf(rows[Math.min(rows.length - 1, Math.max(0, r))] ?? row)[c];

  let next: HTMLElement | undefined;
  switch (key) {
    case 'ArrowRight':
      next = cells[colIndex + 1];
      break;
    case 'ArrowLeft':
      next = cells[colIndex - 1];
      break;
    case 'Home':
      next = event.ctrlKey ? at(0, 0) : cells[0];
      break;
    case 'End': {
      const last = cellsOf(event.ctrlKey ? rows[rows.length - 1] : row);
      next = last[event.ctrlKey ? last.length - 1 : cells.length - 1];
      break;
    }
    case 'ArrowUp':
      next = rowIndex > 0 ? at(rowIndex - 1, colIndex) : undefined;
      break;
    case 'ArrowDown':
      next = rowIndex < rows.length - 1 ? at(rowIndex + 1, colIndex) : undefined;
      break;
    case 'PageUp':
      next = rowIndex > 0 ? at(rowIndex - 10, colIndex) : undefined;
      break;
    case 'PageDown':
      next = rowIndex < rows.length - 1 ? at(rowIndex + 10, colIndex) : undefined;
      break;
  }
  if (!next) return false;
  event.preventDefault();
  cell.tabIndex = -1;
  next.tabIndex = 0;
  next.focus();
  return true;
}

/**
 * The `Ctrl+C`/`Ctrl+V` half of grid-angular's `handleClipboardShortcut` — resolves the focused
 * cell via the `data-row-index`/`data-field` attributes each `<td>`/`<tr>` carries (only in the
 * flat, non-grouped render path, same restriction), then defers to `copyCellText()`/`pasteAt()`.
 * Ignored while focus is inside a cell's own edit control — native copy/paste of the *selected
 * text* there should win, not a whole-cell copy/paste.
 */
function onTableKeyDown(event: KeyboardEvent) {
  if (handleGridNavigation(event)) return;
  if (!props.clipboard || !(event.ctrlKey || event.metaKey)) return;
  const key = event.key.toLowerCase();
  if (key !== 'c' && key !== 'v') return;
  const target = event.target as HTMLElement;
  if (target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement || target instanceof HTMLSelectElement) return;

  const cell = target.closest<HTMLElement>('td[data-field]');
  const field = cell?.getAttribute('data-field');
  const rowIndexAttr = cell?.closest('tr')?.getAttribute('data-row-index');
  if (!cell || !field || rowIndexAttr === null || rowIndexAttr === undefined) return;
  const rowIndex = Number(rowIndexAttr);

  event.preventDefault();
  if (key === 'c') {
    const range = selectedRange.value;
    const rangeText =
      hasCellRangeSelection.value && range && (range.minRow !== range.maxRow || range.minCol !== range.maxCol)
        ? selectedRangeText(range)
        : undefined;
    navigator.clipboard?.writeText(rangeText ?? grid.copyCellText(rowIndex, field))?.catch(() => undefined);
  } else {
    navigator.clipboard
      ?.readText()
      ?.then(text => grid.pasteAt(rowIndex, field, text))
      .catch(() => undefined);
  }
}

function rowKey(row: InanduGridRow): string {
  return grid.rowKeyOf(row);
}

const rowCtx = computed<RowContext>(() => ({
  columns: grid.visibleColumns,
  t: t.value,
  selectable: props.selectable,
  selectColumnStyle: selectColumnStyle.value,
  columnStyle,
  isRowSelected: grid.isRowSelected,
  toggleRowSelection: grid.toggleRowSelection,
  hasRowActions: hasRowActions.value,
  editableColumnCount: grid.editableColumns.length,
  isEditingRow: grid.isEditingRow,
  isAnotherRowEditing: grid.isAnotherRowEditing,
  startEditingRow: grid.startEditingRow,
  cancelRowEdit: grid.cancelRowEdit,
  saveRow: row => void grid.saveRow(row),
  deleteRow: grid.deleteRow,
  deletable: props.deletable,
  rowDraft: grid.rowDraft,
  fieldErrors: grid.fieldErrors,
  isValidating: grid.isValidating,
  setRowDraftValue: grid.setRowDraftValue,
  cellContent,
  editorContent,
  detailContent,
  clipboard: props.clipboard,
  cellRangeSelection: hasCellRangeSelection.value,
  isCellInRange,
  onCellRangeMouseDown,
  onCellRangeMouseEnter,
  extraColumnCount: extraColumnCount.value,
}));
</script>

<template>
  <div
    :id="id || undefined"
    :dir="dir"
    :class="theme ? `inandu-grid-vue inandu-theme-${theme}` : 'inandu-grid-vue'"
    :style="width ? { width: `${width}px` } : undefined"
  >
    <!-- What a sighted user sees without moving focus: an error, loading, or an empty result. -->
    <div class="inandu-grid-sr-only" role="status" aria-live="polite">{{ error || (loading ? t('MsgLoading') : isEmpty ? t('MsgNoData') : '') }}</div>
    <div v-if="filter" class="inandu-grid-search">
      <input
        :aria-label="filterPlaceholder || t('MsgFilterPlaceholder')"
        type="text"
        :placeholder="filterPlaceholder ?? `${t('MsgFilterPlaceholder')}…`"
        :value="grid.filterQuery"
        @input="grid.setFilterQuery(($event.target as HTMLInputElement).value)"
      />
    </div>
    <div class="inandu-grid-toolbar">
      <template v-if="exportable">
        <button type="button" :disabled="loading || !!error" @click="exportCsv(grid.exportRows, grid.visibleColumns, locale, exportBase)">{{ t('MsgExportCsv') }}</button>
        <button type="button" :disabled="loading || !!error" @click="exportExcel(grid.exportRows, grid.visibleColumns, locale, exportBase)">{{ t('MsgExportExcel') }}</button>
        <button type="button" :disabled="loading || !!error" @click="void exportPdf(grid.exportRows, grid.visibleColumns, locale, exportBase)">{{ t('MsgExportPdf') }}</button>
        <button type="button" :disabled="loading || !!error" @click="printTable(grid.exportRows, grid.visibleColumns, locale, exportBase)">{{ t('MsgPrint') }}</button>
      </template>
      <button v-if="creatable && grid.editableColumns.length > 0 && !grid.isAddingRow" type="button" @click="grid.startAddingRow()">
        {{ t('MsgAddRow') }}
      </button>
      <button v-if="selectable && deletable && grid.selectedRows.size > 0" type="button" @click="grid.deleteSelectedRows()">
        {{ t('MsgDeleteSelected', { count: grid.selectedRows.size }) }}
      </button>
      <details v-if="columnToggle" class="inandu-grid-column-toggle">
        <summary>{{ t('MsgToggleColumns') }}</summary>
        <ul>
          <li v-for="column in grid.hideableColumns" :key="column.field">
            <label>
              <input
                :aria-label="t('MsgToggleColumn', { column: column.headerText ?? column.field })"
                type="checkbox"
                :checked="!grid.isColumnHidden(column.field)"
                @change="onColumnToggle($event, column.field)"
              />
              {{ column.headerText ?? column.field }}
            </label>
          </li>
        </ul>
      </details>
    </div>
    <div v-if="groupableColumns.length > 0" class="inandu-grid-group-by">
      <label>
        {{
          grid.groupByField
            ? t('MsgGroupedBy', { column: groupableColumns.find(c => c.field === grid.groupByField)?.headerText ?? grid.groupByField })
            : t('MsgGroupByHint')
        }}
        <!-- No dictionary key names this control itself (grid-angular's equivalent is a drag-and-drop zone, not a picker) — "Group by" is structural chrome, not a translated message. -->
        <select
          aria-label="Group by"
          :value="grid.groupByField ?? ''"
          @change="grid.setGroupByField(($event.target as HTMLSelectElement).value || undefined)"
        >
          <option value="">{{ t('MsgCancelGrouping') }}</option>
          <option v-for="column in groupableColumns" :key="column.field" :value="column.field">{{ column.headerText ?? column.field }}</option>
        </select>
      </label>
    </div>
    <div
      :class="grid.hasVirtualScroll ? 'inandu-grid-viewport' : undefined"
      :style="grid.hasVirtualScroll ? { height: `${height}px`, overflow: 'auto' } : undefined"
      @scroll="onViewportScroll"
    >
      <table ref="tableRef" class="inandu-grid" role="grid" :aria-rowcount="ariaRowCount" @keydown="onTableKeyDown">
        <thead>
          <tr role="row">
            <th role="columnheader" v-if="hasMasterDetail" />
            <th role="columnheader" v-if="hasRowDragHandle" />
            <th role="columnheader" v-if="selectable" tabindex="0" :style="selectColumnStyle">
              <input
                :aria-label="t('MsgSelectAll')"
                type="checkbox"
                :checked="grid.allSelected"
                :indeterminate="grid.someSelected"
                @change="grid.toggleSelectAll()"
              />
            </th>
            <th role="columnheader"
              v-for="(column, colIndex) in grid.visibleColumns"
              :key="column.field"
              :data-field="column.field"
              :tabindex="colIndex === 0 && !selectable ? 0 : -1"
              :aria-sort="ariaSort(column.field)"
              :style="columnStyle(column)"
              :class="dragOverField === column.field ? 'inandu-drag-over' : undefined"
              :draggable="column.reorder !== false"
              :aria-label="t('MsgSortBy', { column: column.headerText ?? column.field })"
              @dragstart="onHeaderDragStart($event, column.field)"
              @dragover="onHeaderDragOver($event, column.field)"
              @dragleave="onHeaderDragLeave(column.field)"
              @drop="onHeaderDrop($event, column.field)"
              @click="grid.toggleSort(column.field, $event.shiftKey)"
            >
              <RenderNodes :nodes="headerContent(column)" />{{
                grid.sortDirectionFor(column.field) ? (grid.sortDirectionFor(column.field) === 'asc' ? ' ▲' : ' ▼') : ''
              }}<sup v-if="grid.sortPriorityFor(column.field) !== undefined" class="inandu-grid-sort-priority">{{
                grid.sortPriorityFor(column.field)
              }}</sup>
              <span
                class="inandu-grid-resize-handle"
                draggable="false"
                @mousedown="onResizeMouseDown($event, column.field)"
                @dblclick="onResizeDoubleClick($event, column)"
                @click.stop
              />
            </th>
            <th role="columnheader" v-if="hasRowActions" />
          </tr>
          <tr role="row" class="inandu-grid-filter-row">
            <th role="columnheader" v-if="hasMasterDetail" />
            <th role="columnheader" v-if="hasRowDragHandle" />
            <th role="columnheader" v-if="selectable" :style="selectColumnStyle" />
            <th role="columnheader" v-for="column in grid.visibleColumns" :key="column.field" :style="columnStyle(column)">
              <FilterControl :column="column" :value="grid.filterValues[column.field]" :t="t" @change="patch => patchFilterValue(column.field, patch)" />
            </th>
            <th role="columnheader" v-if="hasRowActions" />
          </tr>
        </thead>
        <tbody v-if="pinnedTopRows.length > 0 && !grid.hasVirtualScroll" class="inandu-grid-pinned inandu-grid-pinned-top">
          <tr v-for="(pinned, index) in pinnedTopRows" :key="`top-${index}`" role="row" class="inandu-grid-pinned-row">
            <td v-if="hasMasterDetail" role="gridcell" />
            <td v-if="hasRowDragHandle" role="gridcell" />
            <td v-if="selectable" role="gridcell" :style="selectColumnStyle" />
            <td v-for="column in grid.visibleColumns" :key="column.field" role="gridcell" tabindex="-1" :style="columnStyle(column)">
              <RenderNodes :nodes="cellContent(column, pinned)" />
            </td>
            <td v-if="hasRowActions" role="gridcell" />
          </tr>
        </tbody>
        <tbody>
          <!-- The blank draft row shown above the data while `creatable`'s "Add row" trigger is active — every editable field starts empty, nothing needs seeding (unlike editing an existing row). -->
          <tr role="row" v-if="grid.isAddingRow" class="inandu-grid-new-row">
            <td role="gridcell" v-if="selectable" :style="selectColumnStyle" />
            <td role="gridcell" v-for="column in grid.visibleColumns" :key="column.field" :style="columnStyle(column)">
              <template v-if="column.editable">
                <RenderNodes v-if="editorContent(column, {}) !== undefined" :nodes="editorContent(column, {})" />
                <EditCell
                  v-else
                  :column="column"
                  :value="grid.rowDraft[column.field]"
                  :error="grid.fieldErrors[column.field]"
                  :t="t"
                  @change="value => grid.setRowDraftValue(column.field, value)"
                />
              </template>
            </td>
            <td role="gridcell" v-if="hasRowActions" class="inandu-grid-row-actions">
              <button type="button" :disabled="grid.isValidating" @click="void grid.saveNewRow()">{{ t('MsgSaveRow') }}</button>
              <button type="button" :disabled="grid.isValidating" @click="grid.cancelAddRow()">{{ t('MsgCancelRowEdit') }}</button>
            </td>
          </tr>
          <tr role="row" v-if="error" class="inandu-grid-error-row">
            <td role="gridcell" :colspan="totalColumnCount">{{ error }}</td>
          </tr>
          <tr role="row" v-else-if="loading" class="inandu-grid-loading-row">
            <td role="gridcell" :colspan="totalColumnCount">{{ t('MsgLoading') }}</td>
          </tr>
          <tr role="row" v-else-if="isEmpty">
            <td role="gridcell" :colspan="totalColumnCount">{{ t('MsgNoData') }}</td>
          </tr>
          <!--
            One tree-data row — display + expand only (no inline editing, drag-reorder or clipboard, same
            restriction grid-angular has). The first visible column's cell carries the depth indent and an
            expand/collapse toggle when the node has children. Same layout as grid-angular's `#treeRow` template.
          -->
          <template v-else-if="grid.hasTreeData">
            <tr role="row"
              v-for="(node, index) in grid.treeRows"
              :key="rowKey(node.row)"
              :aria-selected="selectable ? grid.isRowSelected(node.row) : undefined"
              :aria-level="node.depth + 1"
              :aria-expanded="node.expandable ? grid.isTreeRowExpanded(node.row) : undefined"
            >
              <td role="gridcell" v-if="selectable" :style="selectColumnStyle">
                <input
                  :aria-label="t('MsgSelectRow', { index: index + 1 })"
                  type="checkbox"
                  :checked="grid.isRowSelected(node.row)"
                  @change="grid.toggleRowSelection(node.row)"
                />
              </td>
              <td role="gridcell" v-for="(column, colIndex) in grid.visibleColumns" :key="column.field" :style="columnStyle(column)">
                <span v-if="colIndex === 0" class="inandu-grid-tree-cell" :style="{ paddingInlineStart: `${node.depth * 16}px` }">
                  <button
                    v-if="node.expandable"
                    type="button"
                    class="inandu-grid-tree-toggle"
                    :aria-label="grid.isTreeRowExpanded(node.row) ? t('MsgCollapseDetail') : t('MsgExpandDetail')"
                    :title="grid.isTreeRowExpanded(node.row) ? t('MsgCollapseDetail') : t('MsgExpandDetail')"
                    @click="grid.toggleTreeRow(node.row)"
                  >
                    {{ grid.isTreeRowExpanded(node.row) ? '▾' : '▸' }}
                  </button>
                  <span v-else class="inandu-grid-tree-toggle-spacer" aria-hidden="true" />
                  <RenderNodes :nodes="cellContent(column, node.row)" />
                </span>
                <RenderNodes v-else :nodes="cellContent(column, node.row)" />
              </td>
              <td role="gridcell" v-if="hasRowActions" class="inandu-grid-row-actions" />
            </tr>
          </template>
          <!-- One group header row (key + row count + per-aggregate-column labels) followed by its own data rows. -->
          <template v-else-if="grid.groups">
            <template v-for="group in grid.groups" :key="group.key">
              <tr role="row" class="inandu-grid-group-row">
                <td role="gridcell" :colspan="totalColumnCount">
                  <strong>{{ group.key }}</strong> ({{ group.rows.length }})
                  <span v-if="aggregateColumns.length > 0" class="inandu-grid-group-aggregates">
                    <span v-for="column in aggregateColumns" :key="column.field"> · {{ aggregateLabel(column, group.aggregates) }}</span>
                  </span>
                </td>
              </tr>
              <DataRow
                v-for="(row, index) in group.rows"
                :key="rowKey(row)"
                :ctx="rowCtx"
                :row="row"
                :row-index="index"
              />
            </template>
          </template>
          <template v-else>
            <tr role="row" v-if="grid.hasVirtualScroll && topSpacerHeight > 0" aria-hidden="true">
              <td role="gridcell" :style="{ height: `${topSpacerHeight}px`, padding: 0, border: 'none' }" :colspan="totalColumnCount" />
            </tr>
            <DataRow
              v-for="(row, offset) in windowedRows"
              :key="rowKey(row)"
              :ctx="rowCtx"
              :row="row"
              :row-index="windowStart + offset"
              :has-row-drag-handle="hasRowDragHandle"
              :is-drag-over-row="grid.draggingRow !== undefined && dragOverRow === row"
              :has-master-detail="hasMasterDetail"
              :is-row-expanded="grid.isRowExpanded(row)"
              @row-drag-start="grid.onRowDragStart(row)"
              @row-drag-over="dragOverRow = row"
              @row-drag-leave="dragOverRow === row && (dragOverRow = undefined)"
              @row-drop="grid.onRowDrop(row)"
              @toggle-expanded="grid.toggleRowExpanded(row)"
            />
            <tr role="row" v-if="grid.hasVirtualScroll && bottomSpacerHeight > 0" aria-hidden="true">
              <td role="gridcell" :style="{ height: `${bottomSpacerHeight}px`, padding: 0, border: 'none' }" :colspan="totalColumnCount" />
            </tr>
          </template>
        </tbody>
        <tbody v-if="pinnedBottomRows.length > 0 && !grid.hasVirtualScroll" class="inandu-grid-pinned inandu-grid-pinned-bottom">
          <tr v-for="(pinned, index) in pinnedBottomRows" :key="`bottom-${index}`" role="row" class="inandu-grid-pinned-row">
            <td v-if="hasMasterDetail" role="gridcell" />
            <td v-if="hasRowDragHandle" role="gridcell" />
            <td v-if="selectable" role="gridcell" :style="selectColumnStyle" />
            <td v-for="column in grid.visibleColumns" :key="column.field" role="gridcell" tabindex="-1" :style="columnStyle(column)">
              <RenderNodes :nodes="cellContent(column, pinned)" />
            </td>
            <td v-if="hasRowActions" role="gridcell" />
          </tr>
        </tbody>
        <tfoot v-if="showTotals && aggregateColumns.length > 0 && !grid.hasVirtualScroll">
          <tr role="row" class="inandu-grid-totals-row">
            <td role="gridcell" v-if="hasMasterDetail" />
            <td role="gridcell" v-if="hasRowDragHandle" />
            <td role="gridcell" v-if="selectable" :style="selectColumnStyle" />
            <td role="gridcell" v-for="column in grid.visibleColumns" :key="column.field" :style="columnStyle(column)">
              {{ column.aggregate ? aggregateLabel(column, grid.totals) : '' }}
            </td>
            <td role="gridcell" v-if="hasRowActions" />
          </tr>
        </tfoot>
      </table>
    </div>
    <div v-if="pageSize > 0 && !grid.groupByField && !grid.hasVirtualScroll" class="inandu-grid-pagination">
      <button type="button" :disabled="grid.page === 0" @click="grid.setPage(grid.page - 1)">‹ {{ t('MsgPreviousPage') }}</button>
      <span>{{ t('MsgPageOf', { page: grid.page + 1, total: grid.pageCount }) }} ({{ grid.filteredRowCount }})</span>
      <button type="button" :disabled="grid.page >= grid.pageCount - 1" @click="grid.setPage(grid.page + 1)">{{ t('MsgNextPage') }} ›</button>
    </div>
  </div>
</template>

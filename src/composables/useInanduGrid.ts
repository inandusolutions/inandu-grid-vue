import { computed, shallowRef, toValue, watch, type MaybeRefOrGetter, type VNodeChild } from 'vue';
import {
  ColumnConfig,
  collectTreeRows,
  flattenTree,
  InanduColumnAggregate,
  InanduColumnStickySide,
  InanduColumnType,
  InanduGridColumnFilterValue,
  InanduGridRow,
  coerceToDate,
  compareCellValues,
  computeGroupAggregates,
  formatCellValue,
  hasMeaningfulFilterValue,
  matchesColumnFilter,
  MIN_COLUMN_WIDTH,
  parseDraftValue,
  parsePastedCellValue,
  SELECT_COLUMN_WIDTH,
  TreeVisibleRow,
} from '../core';
import { createTranslator } from '../utils/translate';

/**
 * Plain-value column definition for the Vue API — friendlier than the core's `ColumnConfig`
 * getter shape (`field()`, `type()`, ...), which exists to match grid-angular's signal-based
 * columns. `toColumnConfig` below adapts one to the other so the ported core needs no changes.
 */
export interface InanduGridColumn {
  field: string;
  headerText?: string;
  type?: InanduColumnType;
  format?: string;
  order?: number;
  aggregate?: InanduColumnAggregate;
  /** Whether this column can be picked in the "group by" control. Default: true. */
  groupable?: boolean;
  /** Whether this field shows an editable control while its row is in edit/add mode. Default: false. */
  editable?: boolean;
  required?: boolean;
  /** `'number'` columns only. */
  min?: number;
  /** `'number'` columns only. */
  max?: number;
  /** Checked against the raw (unparsed) draft value, `'string'`/`'number'`/`'date'` columns only. */
  pattern?: string;
  /** Runs after required/min/max/pattern all pass, against the parsed value and the row's other parsed fields (for cross-field checks). */
  validator?: (parsed: unknown, parsedRow: Record<string, unknown>) => string | null;
  /** Runs only once every synchronous rule (above) has already passed for this field; every field's async check runs concurrently. */
  asyncValidator?: (parsed: unknown, parsedRow: Record<string, unknown>) => Promise<string | null>;
  /** Whether this column can be hidden via the column-visibility toggle. Default: true. */
  hideable?: boolean;
  /** Pins the column to that side of the table, `position: sticky`, regardless of scroll. Unset: not pinned. */
  pinned?: InanduColumnStickySide;
  /** Fixed column width in px — also what `stickyOffset`/`stickyOffsetRight` stack against. Default (unset): 80, same fallback grid-angular's `effectiveWidth() || 80` uses. */
  width?: number;
  /** Whether this column's header can be dragged to reorder columns. Default: true. */
  reorder?: boolean;
  /**
   * Custom rendering for this column's cells, in place of the built-in formatted text — a render
   * function returning VNodes (use `h()`). The `#cell-<field>` scoped slot on `<InanduGrid>` does the
   * same thing template-side and wins when both are set. Doesn't affect editing — pair with
   * `renderEditor` (or `#editor-<field>`) if this column is also `editable`.
   */
  renderCell?: (ctx: InanduCellRenderContext) => VNodeChild;
  /** Custom rendering for this column's header label (or the `#header-<field>` slot). The sort arrow, multi-sort priority badge, and resize handle next to it are unaffected — same scope as grid-angular's `#inanduHeaderTemplate`. */
  renderHeader?: (ctx: InanduHeaderRenderContext) => VNodeChild;
  /** Custom editor for this column's cells while their row is in edit/create mode (or the `#editor-<field>` slot), in place of the built-in type-aware `<input>`/`<select>`. The column must still be `editable`; save-time parsing/validation is unaffected — call `setValue` with the same raw control shape the built-in control would produce (a string for `'string'`/`'number'`/`'date'`, a boolean for `'boolean'`). */
  renderEditor?: (ctx: InanduEditRenderContext) => VNodeChild;
}

/** Passed to a column's `renderCell` / `#cell-<field>` slot — the same information the built-in formatted-text cell would use. */
export interface InanduCellRenderContext {
  value: unknown;
  row: InanduGridRow;
  field: string;
}

/** Passed to a column's `renderHeader` / `#header-<field>` slot. `title` is the resolved display label (`headerText` if set, else `field` — the same fallback the built-in plain-text header uses). */
export interface InanduHeaderRenderContext {
  title: string;
  field: string;
}

/**
 * Passed to a column's `renderEditor` / `#editor-<field>` slot. `row` is `{}` for the add-new-row draft.
 *
 * Because `value` is always the raw control shape, a cell that holds an array or an object arrives as text (`String(raw)`: `['a','b']` becomes `"a,b"`, `{ ... }` becomes `"[object Object]"`). Store such values as strings (comma-joined, `from..to`, ...) and let the editor parse and format them - as grid-pro's multiselect (`joinWith`) and date-range (`sep`) editors do - or read the original typed value from `row[field]`.
 */
export interface InanduEditRenderContext {
  value: unknown;
  row: InanduGridRow;
  field: string;
  setValue: (value: unknown) => void;
  error: string | undefined;
}

/** Passed to `onRowSave` — everything `saveRow()` parsed and validated for one already-existing row. */
export interface InanduGridRowSave {
  row: InanduGridRow;
  values: Record<string, unknown>;
}

/** One cell update from a `pasteAt()` call — one entry per pasted cell that landed on an existing row and an editable column. */
export interface InanduGridCellPaste {
  row: InanduGridRow;
  field: string;
  value: unknown;
}

function toColumnConfig(column: InanduGridColumn): ColumnConfig {
  return {
    field: () => column.field,
    type: () => column.type ?? 'string',
    format: () => column.format ?? '',
    order: () => column.order,
    aggregate: () => column.aggregate ?? '',
  };
}

/**
 * What `onQueryChange` emits in `serverSide` mode: the grid's whole request state, ready for
 * `useInanduGridServer` (or a hand-rolled fetch) to turn into a query string. `page` is 0-based,
 * like the composable's own `page`.
 */
export interface InanduGridServerQuery {
  page: number;
  pageSize: number;
  sortCriteria: InanduGridSort[];
  filterValues: Record<string, InanduGridColumnFilterValue>;
  filterQuery: string;
}

export interface InanduGridSort {
  field: string;
  direction: 'asc' | 'desc';
}

/** One bucket of `useInanduGrid`'s `groups` — mirrors grid-angular's `groupedRows`. */
export interface InanduGridGroup {
  /** The grouped column's *formatted* display value for every row in this bucket. */
  key: string;
  rows: InanduGridRow[];
  /** One entry per column with `aggregate` set, keyed by that column's field. */
  aggregates: Record<string, number>;
}

export interface UseInanduGridOptions {
  rows: InanduGridRow[];
  columns: InanduGridColumn[];
  locale?: string;
  /** Drives validation-message translation. Default: `locale`'s primary subtag. */
  lang?: string;
  /** 0 disables pagination — `visibleRows` is the full sorted/filtered set. Default: 0. */
  pageSize?: number;
  /** Whether the caller renders a select-checkbox column — `stickyOffset()` needs to know, since that column (when present) is always sticky-left too. Default: false. */
  selectable?: boolean;
  /** `window.confirm()`-gates `deleteRow()`, same as grid-angular. Unset: deletes immediately. */
  deleteConfirmMessage?: string;
  /** `window.confirm()`-gates `deleteSelectedRows()`. Unset: deletes immediately. */
  bulkDeleteConfirmMessage?: string;
  /** Called by `saveRow()` once validation passes — the grid never mutates `rows` itself; applying the change is the caller's job. */
  onRowSave?: (event: InanduGridRowSave) => void;
  /** Called by `saveNewRow()` once validation passes. No row reference — it doesn't exist in `rows` yet. */
  onRowCreate?: (values: Record<string, unknown>) => void;
  /** Called by `deleteRow()` (after confirmation, if any). */
  onRowDelete?: (row: InanduGridRow) => void;
  /** Called by `deleteSelectedRows()` (after confirmation, if any) — every currently-selected row. */
  onRowsDelete?: (rows: InanduGridRow[]) => void;
  /** Called by `pasteAt()` with every parsed cell update — the grid never mutates `rows` itself. */
  onCellsPaste?: (updates: InanduGridCellPaste[]) => void;
  /** Called by `onRowDrop()` with the fully reordered row array — the grid never mutates `rows` itself. */
  onRowOrderChange?: (rows: InanduGridRow[]) => void;
  /**
   * Turns on tree mode: the name of the field on each row holding its child rows (a nested array
   * of the same shape). `rows` is then the root rows; free-text/column filters keep a node when it
   * or any descendant matches, and the active sort orders each level of siblings. Auto-disabled
   * while grouped, same restriction grid-angular's `treeChildrenKey` has (there it also excludes
   * virtual-scroll/server-side, neither of which this port has). Unset (default): tree mode off.
   */
  treeChildrenKey?: string;
  /** Initial expand state for tree mode: `'none'` (default), `'all'`, or a max depth to open to. */
  treeDefaultExpanded?: 'none' | 'all' | number;
  /** Whether master-detail is on — the caller checks this itself, this only controls `toggleRowExpanded`'s accordion behavior. Off (any number of rows can be expanded at once) by default. */
  singleDetailExpand?: boolean;
  /**
   * Opt-in row virtualization for large datasets — bypasses pagination entirely (same as grouping),
   * feeding the windowing logic the full sorted/filtered set instead. Auto-disables grouping,
   * master-detail, tree data, row drag-reorder and clipboard, same restrictions grid-angular's
   * `virtualScroll` has (there it also covers server-side infinite-scroll, which this port doesn't
   * have). The actual DOM windowing (which rows are mounted, given a real scroll position) is the
   * `<InanduGrid>` component's job, not this composable's — it has no way to observe scroll state itself.
   */
  virtualScroll?: boolean;
  /** An extra per-row predicate ANDed onto the free-text + column filters — same as grid-angular's `extraRowFilter`. Lets a caller layer its own filtering (e.g. an advanced-filter query) on top of the grid's own. Unset: no extra filtering. */
  extraRowFilter?: (row: InanduGridRow) => boolean;
  /**
   * Server-side mode: `rows` is already the current page, as sorted/filtered/paged by the server
   * (see `useInanduGridServer`). The composable keeps owning the sort / filter / search / page
   * *state* so `<InanduGrid>`'s controls work unchanged, but stops applying it to `rows` and reads
   * the page count from `totalItems`. Grouping, tree data, virtual scroll, `extraRowFilter` and
   * column-aggregate totals are not available (they would only see one page). Unset: client-side.
   */
  serverSide?: { totalItems: number };
  /** `serverSide` only: called once on setup and again whenever page, sort, filters or search change. */
  onQueryChange?: (query: InanduGridServerQuery) => void;
}

/**
 * Headless engine for the grid: owns sort + per-column filter + pagination state and derives
 * `visibleRows` (the current page) and `filteredRowCount` (before pagination) from `rows` using
 * the same pure core as grid-angular. No rendering — `<InanduGrid>` is one consumer of this
 * composable, not the only way to use it.
 *
 * `options` may be a plain object, a ref, or a getter — pass a getter (`() => ({ rows: rows.value,
 * columns })`) to have the grid follow reactive data. The returned object exposes every piece of
 * state as a reactive *getter* (read `grid.visibleRows`, not `grid.visibleRows.value`), so reading
 * it inside a template, `computed` or `watch` tracks it. Don't destructure state properties out of
 * it — that snapshots their current value; the methods are safe to destructure.
 */
export function useInanduGrid(options: MaybeRefOrGetter<UseInanduGridOptions>) {
  const opt = <K extends keyof UseInanduGridOptions>(key: K) => computed(() => toValue(options)[key]);
  const rows = opt('rows');
  const columns = opt('columns');
  const locale = computed(() => toValue(options).locale ?? 'en');
  const lang = opt('lang');
  const pageSize = computed(() => toValue(options).pageSize ?? 0);
  const selectable = computed(() => toValue(options).selectable ?? false);
  const treeChildrenKey = opt('treeChildrenKey');
  const treeDefaultExpanded = computed(() => toValue(options).treeDefaultExpanded ?? 'none');
  const virtualScroll = computed(() => toValue(options).virtualScroll ?? false);
  const extraRowFilter = opt('extraRowFilter');
  const serverSide = opt('serverSide');
  const isServerSide = computed(() => !!serverSide.value);
  /** Callbacks and confirm messages are read at call time, never tracked. */
  const current = () => toValue(options);

  const sortCriteria = shallowRef<InanduGridSort[]>([]);
  const filterValues = shallowRef<Record<string, InanduGridColumnFilterValue>>({});
  const filterQuery = shallowRef('');
  const page = shallowRef(0);
  const groupByState = shallowRef<string | undefined>(undefined);
  // Grouping would only ever bucket the one page the server returned, so server mode turns it off.
  const groupByField = computed(() => (isServerSide.value ? undefined : groupByState.value));
  const selectedRows = shallowRef<Set<InanduGridRow>>(new Set());
  const editingRow = shallowRef<InanduGridRow | undefined>(undefined);
  const isAddingRow = shallowRef(false);
  const rowDraft = shallowRef<Record<string, unknown>>({});
  const fieldErrors = shallowRef<Record<string, string>>({});
  const isValidating = shallowRef(false);
  const hiddenFields = shallowRef<Set<string>>(new Set());
  const reorderedFields = shallowRef<string[] | undefined>(undefined);
  const draggingField = shallowRef<string | undefined>(undefined);
  const columnWidths = shallowRef<Record<string, number>>({});
  const pinnedOverrides = shallowRef<Record<string, InanduColumnStickySide | 'none'>>({});
  const draggingRow = shallowRef<InanduGridRow | undefined>(undefined);
  const expandedTreeRows = shallowRef<Set<InanduGridRow>>(new Set());
  const expandedRows = shallowRef<Set<InanduGridRow>>(new Set());
  let treeSeededFor: InanduGridRow[] | undefined;

  const t = computed(() => createTranslator(lang.value ?? locale.value));

  /**
   * `columns` in `reorderedFields`'s order, if any drag-reorder (or `setColumnOrder()`) has
   * happened yet — a field `reorderedFields` doesn't mention (new since the last reorder) "flows in
   * at the end", same as grid-angular's `displayColumns()`. Includes hidden columns, same as
   * grid-angular's `displayColumns()` — only `visibleColumns` (below) filters those out.
   */
  const orderedColumns = computed(() => {
    const order = reorderedFields.value;
    if (!order) return columns.value;
    const byField = new Map(columns.value.map(column => [column.field, column]));
    const ordered: InanduGridColumn[] = [];
    for (const field of order) {
      const column = byField.get(field);
      if (column) {
        ordered.push(column);
        byField.delete(field);
      }
    }
    ordered.push(...byField.values());
    return ordered;
  });

  /**
   * `orderedColumns` minus whatever's currently hidden — what every other computation below
   * operates over (search, filters, sort, grouping, aggregates, export, paste), same as
   * grid-angular's `visibleColumns`. Always non-empty (see `toggleColumnVisibility`'s floor).
   */
  const visibleColumns = computed(() =>
    hiddenFields.value.size === 0 ? orderedColumns.value : orderedColumns.value.filter(column => !hiddenFields.value.has(column.field)),
  );

  /** Every column that can be hidden, from the *full* `orderedColumns` list (not `visibleColumns`) — the toggle popup's checklist needs to list a currently-hidden column too, so it can be shown again. */
  const hideableColumns = computed(() => orderedColumns.value.filter(column => column.hideable !== false));

  /**
   * Sets the full column order directly, bypassing the header drag-and-drop gesture. `fields`
   * should list every column's field, in the desired order; any field it omits keeps its current
   * relative position and is appended after the fields it does list — so passing a subset is safe.
   * Fields that don't match any current column are ignored. Same semantics as grid-angular's
   * `setColumnOrder`.
   */
  function setColumnOrder(fields: readonly string[]): void {
    const currentFields = orderedColumns.value.map(column => column.field);
    const currentSet = new Set(currentFields);
    const requested = fields.filter(field => currentSet.has(field));
    const requestedSet = new Set(requested);
    const remaining = currentFields.filter(field => !requestedSet.has(field));
    reorderedFields.value = [...requested, ...remaining];
  }

  function onColumnDragStart(field: string): void {
    draggingField.value = field;
  }

  /** Dropping a dragged header onto another header — inserts the dragged column immediately before `targetField`. Same semantics (and `reorder: false` opt-out) as grid-angular's `onColumnHeaderDrop`. */
  function onColumnDrop(targetField: string): void {
    const draggedField = draggingField.value;
    draggingField.value = undefined;
    if (!draggedField || draggedField === targetField) return;

    const draggedColumn = orderedColumns.value.find(column => column.field === draggedField);
    if (!draggedColumn || draggedColumn.reorder === false) return;

    const fields = orderedColumns.value.map(column => column.field);
    const fromIndex = fields.indexOf(draggedField);
    let toIndex = fields.indexOf(targetField);
    if (fromIndex === -1 || toIndex === -1) return;

    fields.splice(fromIndex, 1);
    if (fromIndex < toIndex) toIndex--; // the removal above shifted every later index down by one
    fields.splice(toIndex, 0, draggedField);
    setColumnOrder(fields);
  }

  function isColumnHidden(field: string): boolean {
    return hiddenFields.value.has(field);
  }

  /** Un-hiding is always allowed; hiding is refused if `field` is currently the only visible column left — see grid-angular's `toggleColumnVisibility` for why that floor exists. */
  function toggleColumnVisibility(field: string): void {
    if (hiddenFields.value.has(field)) {
      const next = new Set(hiddenFields.value);
      next.delete(field);
      hiddenFields.value = next;
      return;
    }
    if (visibleColumns.value.length <= 1) return;
    hiddenFields.value = new Set(hiddenFields.value).add(field);
  }

  const editableColumns = computed(() => visibleColumns.value.filter(column => column.editable));

  function setFilterQuery(query: string) {
    page.value = 0;
    filterQuery.value = query;
  }

  const columnConfigs = computed(() => new Map(visibleColumns.value.map(column => [column.field, toColumnConfig(column)])));

  const aggregateColumnConfigs = computed(() =>
    visibleColumns.value.filter(column => column.aggregate).map(column => columnConfigs.value.get(column.field)!),
  );

  function setFilterValue(field: string, value: InanduGridColumnFilterValue) {
    page.value = 0;
    filterValues.value = { ...filterValues.value, [field]: value };
  }

  /** Removes every column's filter entry at once — same as grid-angular's `clearAllColumnFilters`. */
  function clearAllFilters(): void {
    page.value = 0;
    filterValues.value = {};
  }

  /** Free-text search: a row matches if ANY column's formatted display value contains the query (case-insensitive) — same semantics as grid-angular's `filteredData`. */
  function matchesQuery(row: InanduGridRow, query: string): boolean {
    return visibleColumns.value.some(column => {
      const config = columnConfigs.value.get(column.field)!;
      return formatCellValue(row[column.field], config.type(), config.format(), locale.value).toLowerCase().includes(query);
    });
  }

  function matchesFilters(row: InanduGridRow, activeFilters: [string, InanduGridColumnFilterValue][]): boolean {
    return activeFilters.every(([field, value]) => {
      const column = columnConfigs.value.get(field);
      return column ? matchesColumnFilter(column, row, value, locale.value) : true;
    });
  }

  function compareRows(a: InanduGridRow, b: InanduGridRow): number {
    for (const { field, direction } of sortCriteria.value) {
      const cmp = compareCellValues(a[field], b[field], locale.value) * (direction === 'asc' ? 1 : -1);
      if (cmp !== 0) return cmp;
    }
    return 0;
  }

  const sortedFilteredRows = computed(() => {
    let result = rows.value;
    if (isServerSide.value) return result; // the server already searched, filtered and sorted

    // Free-text search first, then the per-column filters, then `extraRowFilter` — same order as grid-angular.
    const query = filterQuery.value.trim().toLowerCase();
    if (query) result = result.filter(row => matchesQuery(row, query));

    const activeFilters = Object.entries(filterValues.value).filter(([, value]) => hasMeaningfulFilterValue(value));
    if (activeFilters.length > 0) result = result.filter(row => matchesFilters(row, activeFilters));

    const extra = extraRowFilter.value;
    if (extra) result = result.filter(extra);

    if (sortCriteria.value.length > 0) result = [...result].sort(compareRows);

    return result;
  });

  /**
   * `sortedFilteredRows` bucketed by the grouped column's *formatted* value, in first-seen order
   * (which, since it reads from `sortedFilteredRows`, follows the active sort) — same semantics as
   * grid-angular's `groupedRows`. `null` when ungrouped.
   */
  const groups = computed<InanduGridGroup[] | null>(() => {
    const groupField = groupByField.value;
    if (!groupField) return null;
    const column = columnConfigs.value.get(groupField);
    if (!column) return null;

    const buckets = new Map<string, InanduGridRow[]>();
    for (const row of sortedFilteredRows.value) {
      const key = formatCellValue(row[groupField], column.type(), column.format(), locale.value);
      const bucket = buckets.get(key);
      if (bucket) bucket.push(row);
      else buckets.set(key, [row]);
    }

    return Array.from(buckets.entries()).map(([key, groupRows]) => ({
      key,
      rows: groupRows,
      aggregates: computeGroupAggregates(groupRows, aggregateColumnConfigs.value),
    }));
  });

  /** Grand-total aggregate for every `aggregate`-bearing column, across all of `sortedFilteredRows` — shown regardless of whether the grid is currently grouped, same as grid-angular's `totalsAggregates`. */
  const totals = computed(() => computeGroupAggregates(sortedFilteredRows.value, aggregateColumnConfigs.value));

  /** Tree mode is on, and grouping/virtual-scroll (its incompatible render paths in this port) aren't. */
  const hasTreeData = computed(() => !!treeChildrenKey.value && !groupByField.value && !virtualScroll.value && !isServerSide.value);

  function childrenOf(row: InanduGridRow): readonly InanduGridRow[] | undefined {
    const key = treeChildrenKey.value;
    const value = key ? row[key] : undefined;
    return Array.isArray(value) ? (value as InanduGridRow[]) : undefined;
  }

  /**
   * `rows` walked into the flat, expansion-aware list tree mode renders — free-text + column
   * filters as a single per-row predicate (keeping a node when it or a descendant matches), the
   * active sort ordering each level of siblings. Same semantics as grid-angular's `treeRows`.
   */
  const treeRows = computed<TreeVisibleRow<InanduGridRow>[]>(() => {
    if (!hasTreeData.value) return [];

    const query = filterQuery.value.trim().toLowerCase();
    const activeFilters = Object.entries(filterValues.value).filter(([, value]) => hasMeaningfulFilterValue(value));
    const extra = extraRowFilter.value;
    const anyFilter = !!query || activeFilters.length > 0 || !!extra;
    const matches = anyFilter
      ? (row: InanduGridRow): boolean => {
          if (query && !matchesQuery(row, query)) return false;
          if (!matchesFilters(row, activeFilters)) return false;
          return extra ? extra(row) : true;
        }
      : undefined;

    const compare = sortCriteria.value.length > 0 ? compareRows : undefined;
    const expanded = expandedTreeRows.value;
    return flattenTree(rows.value, { getChildren: childrenOf, isExpanded: row => expanded.has(row), match: matches, compare });
  });

  // Seeds `expandedTreeRows` from `treeDefaultExpanded` the first time a given `rows` array is
  // seen — same "once per distinct data(), not on every re-render" behavior grid-angular's own
  // seeding effect has (a user's own subsequent expand/collapse clicks must survive re-renders).
  // `flush: 'sync'` so the seeded state is already in place the moment the composable returns.
  watch(
    [hasTreeData, rows, treeDefaultExpanded],
    () => {
      if (!hasTreeData.value || treeSeededFor === rows.value) return;
      treeSeededFor = rows.value;
      const mode = treeDefaultExpanded.value;
      if (mode === 'none') {
        expandedTreeRows.value = new Set();
        return;
      }
      const next = new Set<InanduGridRow>();
      if (mode === 'all') {
        for (const row of collectTreeRows(rows.value, childrenOf)) {
          if (childrenOf(row)?.length) next.add(row);
        }
      } else {
        const walk = (level: readonly InanduGridRow[], depth: number): void => {
          if (depth >= mode) return;
          for (const row of level) {
            const kids = childrenOf(row);
            if (kids?.length) {
              next.add(row);
              walk(kids, depth + 1);
            }
          }
        };
        walk(rows.value, 0);
      }
      expandedTreeRows.value = next;
    },
    { immediate: true, flush: 'sync' },
  );

  function isTreeRowExpanded(row: InanduGridRow): boolean {
    return expandedTreeRows.value.has(row);
  }

  function toggleTreeRow(row: InanduGridRow): void {
    const next = new Set(expandedTreeRows.value);
    if (next.has(row)) next.delete(row);
    else next.add(row);
    expandedTreeRows.value = next;
  }

  /** Expand or collapse every expandable node at once. */
  function setAllTreeRowsExpanded(expanded: boolean): void {
    if (!expanded) {
      expandedTreeRows.value = new Set();
      return;
    }
    const next = new Set<InanduGridRow>();
    for (const row of collectTreeRows(rows.value, childrenOf)) {
      if (childrenOf(row)?.length) next.add(row);
    }
    expandedTreeRows.value = next;
  }

  /** Virtualization is on, and grouping (this port's one incompatible combo — see the option's doc comment) isn't. */
  const hasVirtualScroll = computed(() => virtualScroll.value && !groupByField.value && !isServerSide.value);

  // Grouping, tree mode, and virtualization all bypass pagination entirely, same as grid-angular —
  // none of them has a meaningful "page" (rows are bucketed by group, nested by parent/child, or
  // windowed by scroll position instead).
  const paginationActive = computed(() => pageSize.value > 0 && !groupByField.value && !hasTreeData.value && !hasVirtualScroll.value);
  const totalRowCount = computed(() => (serverSide.value ? serverSide.value.totalItems : sortedFilteredRows.value.length));
  const pageCount = computed(() => (paginationActive.value ? Math.max(1, Math.ceil(totalRowCount.value / pageSize.value)) : 1));
  // Server mode keeps the raw page: `totalItems` is 0 while a request is in flight, and clamping
  // against that would snap the user back to page 1 and fire a second request.
  const clampedPage = computed(() => (isServerSide.value ? page.value : Math.min(page.value, pageCount.value - 1)));

  const visibleRows = computed(() => {
    if (hasTreeData.value) return treeRows.value.map(node => node.row);
    if (!paginationActive.value || isServerSide.value) return sortedFilteredRows.value;
    const start = clampedPage.value * pageSize.value;
    return sortedFilteredRows.value.slice(start, start + pageSize.value);
  });

  watch(
    [isServerSide, clampedPage, pageSize, sortCriteria, filterValues, filterQuery],
    () => {
      if (!isServerSide.value) return;
      current().onQueryChange?.({
        page: clampedPage.value,
        pageSize: pageSize.value,
        sortCriteria: sortCriteria.value,
        filterValues: filterValues.value,
        filterQuery: filterQuery.value,
      });
    },
    { immediate: true },
  );

  /** Rows the "select all" checkbox governs — every group's rows when grouped, or just the current page otherwise (mirrors grid-angular's `pagedData()`/grouped `rows` distinction, minus its virtual-scroll case). */
  const selectionScopeRows = computed(() => (groupByField.value ? sortedFilteredRows.value : visibleRows.value));

  function isRowSelected(row: InanduGridRow): boolean {
    return selectedRows.value.has(row);
  }

  function toggleRowSelection(row: InanduGridRow): void {
    const next = new Set(selectedRows.value);
    if (next.has(row)) next.delete(row);
    else next.add(row);
    selectedRows.value = next;
  }

  const allSelected = computed(
    () => selectionScopeRows.value.length > 0 && selectionScopeRows.value.every(row => selectedRows.value.has(row)),
  );
  const someSelected = computed(() => !allSelected.value && selectionScopeRows.value.some(row => selectedRows.value.has(row)));

  function toggleSelectAll(): void {
    const selectAll = !allSelected.value;
    const next = new Set(selectedRows.value);
    for (const row of selectionScopeRows.value) {
      if (selectAll) next.add(row);
      else next.delete(row);
    }
    selectedRows.value = next;
  }

  function clearSelection(): void {
    selectedRows.value = new Set();
  }

  /**
   * The sort header's click handler. A plain click always collapses the sort to just `field`
   * (toggling asc/desc if it was already the *sole* active criterion, else resetting to ascending).
   * `additive` (a shift-click) instead builds a multi-column sort: appends `field` as a new
   * lowest-priority criterion, or toggles its direction in place if already active. Same semantics
   * as grid-angular's `toggleSort`.
   */
  function toggleSort(field: string, additive = false): void {
    page.value = 0;
    const criteria = sortCriteria.value;
    const index = criteria.findIndex(c => c.field === field);
    if (additive) {
      if (index === -1) {
        sortCriteria.value = [...criteria, { field, direction: 'asc' }];
        return;
      }
      const next = [...criteria];
      next[index] = { field, direction: criteria[index].direction === 'asc' ? 'desc' : 'asc' };
      sortCriteria.value = next;
      return;
    }
    if (criteria.length === 1 && criteria[0].field === field) {
      sortCriteria.value = [{ field, direction: criteria[0].direction === 'asc' ? 'desc' : 'asc' }];
      return;
    }
    sortCriteria.value = [{ field, direction: 'asc' }];
  }

  function setSort(criteria: InanduGridSort[]): void {
    sortCriteria.value = criteria;
  }

  function sortDirectionFor(field: string): 'asc' | 'desc' | undefined {
    return sortCriteria.value.find(c => c.field === field)?.direction;
  }

  /** `field`'s 1-based priority once a *multi*-column sort is active, or `undefined` when it isn't sorted or there's only one active criterion overall. */
  function sortPriorityFor(field: string): number | undefined {
    if (sortCriteria.value.length < 2) return undefined;
    const index = sortCriteria.value.findIndex(c => c.field === field);
    return index === -1 ? undefined : index + 1;
  }

  function isEditingRow(row: InanduGridRow): boolean {
    return editingRow.value === row;
  }

  /** Whether `row`'s own edit/delete controls should be disabled — some *other* row-level action is already in progress. Mirrors grid-angular's `isAnotherRowEditing`. */
  function isAnotherRowEditing(row: InanduGridRow): boolean {
    if (isAddingRow.value) return true;
    return editingRow.value !== undefined && editingRow.value !== row;
  }

  /** The initial draft value for one field when a row enters edit mode — already in the same *raw control* shape a change handler would write back (a string for text/number/date, a boolean for the checkbox). */
  function seedDraftValue(row: InanduGridRow, column: InanduGridColumn): unknown {
    const type = column.type ?? 'string';
    if (type === 'boolean') return !!row[column.field];
    if (type === 'date') {
      const date = coerceToDate(row[column.field]);
      if (Number.isNaN(date.getTime())) return '';
      const pad = (n: number) => String(n).padStart(2, '0');
      return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
    }
    const raw = row[column.field];
    return raw == null ? '' : String(raw);
  }

  function startEditingRow(row: InanduGridRow): void {
    const draft: Record<string, unknown> = {};
    for (const column of editableColumns.value) {
      draft[column.field] = seedDraftValue(row, column);
    }
    editingRow.value = row;
    rowDraft.value = draft;
    fieldErrors.value = {};
  }

  function cancelRowEdit(): void {
    editingRow.value = undefined;
    rowDraft.value = {};
    fieldErrors.value = {};
  }

  function setRowDraftValue(field: string, value: unknown): void {
    rowDraft.value = { ...rowDraft.value, [field]: value };
  }

  /** Runs required/min/max/pattern/validator for one field, in that order, stopping at the first failure — same rule chain (and translated messages) as grid-angular's `validateColumnValue`. */
  function validateColumnValue(
    column: InanduGridColumn,
    raw: unknown,
    parsed: unknown,
    parsedRow: Record<string, unknown>,
  ): string | null {
    const translate = t.value;
    if (column.required && (raw === '' || raw === undefined || raw === null)) {
      return translate('MsgValidationRequired');
    }
    if ((column.type ?? 'string') === 'number' && typeof parsed === 'number') {
      if (column.min !== undefined && parsed < column.min) return translate('MsgValidationMin', { min: column.min });
      if (column.max !== undefined && parsed > column.max) return translate('MsgValidationMax', { max: column.max });
    }
    if (column.pattern && typeof raw === 'string' && raw !== '') {
      let regExp: RegExp | undefined;
      try {
        regExp = new RegExp(column.pattern);
      } catch {
        regExp = undefined;
      }
      if (regExp && !regExp.test(raw)) return translate('MsgValidationPattern');
    }
    if (column.validator) return column.validator(parsed, parsedRow);
    return null;
  }

  /** Cell-level validation for any value, outside the row-edit flow — the same synchronous rule chain `saveRow()` uses, minus `asyncValidator`. */
  function validateCell(column: InanduGridColumn, value: unknown, row: Record<string, unknown> = {}): string | null {
    return validateColumnValue(column, value, value, row);
  }

  /** Parses + validates every `editableColumns` field of `draft` — shared by `saveRow`/`saveNewRow`. `errors` is non-empty exactly when the draft should not be saved. */
  async function validateAndParseDraft(draft: Record<string, unknown>): Promise<{ errors: Record<string, string>; values: Record<string, unknown> }> {
    const columnsToSave = editableColumns.value;
    const parsedRow: Record<string, unknown> = {};
    for (const column of columnsToSave) {
      parsedRow[column.field] = parseDraftValue(draft[column.field], column.type ?? 'string');
    }
    const errors: Record<string, string> = {};
    const values: Record<string, unknown> = {};
    const pendingAsyncChecks: Promise<void>[] = [];
    for (const column of columnsToSave) {
      const field = column.field;
      const message = validateColumnValue(column, draft[field], parsedRow[field], parsedRow);
      if (message) {
        errors[field] = message;
        continue;
      }
      if (!column.asyncValidator) {
        if (parsedRow[field] !== undefined) values[field] = parsedRow[field];
        continue;
      }
      pendingAsyncChecks.push(
        column.asyncValidator(parsedRow[field], parsedRow).then(asyncMessage => {
          if (asyncMessage) errors[field] = asyncMessage;
          else if (parsedRow[field] !== undefined) values[field] = parsedRow[field];
        }),
      );
    }
    if (pendingAsyncChecks.length > 0) {
      isValidating.value = true;
      try {
        await Promise.all(pendingAsyncChecks);
      } finally {
        isValidating.value = false;
      }
    }
    return { errors, values };
  }

  async function saveRow(row: InanduGridRow): Promise<void> {
    if (editingRow.value !== row) return;
    const { errors, values } = await validateAndParseDraft(rowDraft.value);
    if (editingRow.value !== row) return; // stale: cancelled (or a different row started editing) while awaiting an asyncValidator
    if (Object.keys(errors).length > 0) {
      fieldErrors.value = errors;
      return;
    }
    editingRow.value = undefined;
    rowDraft.value = {};
    fieldErrors.value = {};
    current().onRowSave?.({ row, values });
  }

  function deleteRow(row: InanduGridRow): void {
    const message = current().deleteConfirmMessage;
    if (message && !window.confirm(message)) return;
    current().onRowDelete?.(row);
  }

  function deleteSelectedRows(): void {
    const message = current().bulkDeleteConfirmMessage;
    if (message && !window.confirm(message)) return;
    const selected = Array.from(selectedRows.value);
    clearSelection();
    current().onRowsDelete?.(selected);
  }

  function startAddingRow(): void {
    isAddingRow.value = true;
    rowDraft.value = {};
    fieldErrors.value = {};
  }

  function cancelAddRow(): void {
    isAddingRow.value = false;
    rowDraft.value = {};
    fieldErrors.value = {};
  }

  async function saveNewRow(): Promise<void> {
    if (!isAddingRow.value) return;
    const { errors, values } = await validateAndParseDraft(rowDraft.value);
    if (!isAddingRow.value) return; // stale: cancelled while awaiting an asyncValidator
    if (Object.keys(errors).length > 0) {
      fieldErrors.value = errors;
      return;
    }
    isAddingRow.value = false;
    rowDraft.value = {};
    fieldErrors.value = {};
    current().onRowCreate?.(values);
  }

  /** The formatted text `Ctrl+C` would copy for the cell at `visibleRows[rowIndex]`/`field` — `''` if it doesn't resolve to a real, currently-paged cell. */
  function copyCellText(rowIndex: number, field: string): string {
    const row = visibleRows.value[rowIndex];
    const column = columnConfigs.value.get(field);
    if (!row || !column) return '';
    return formatCellValue(row[field], column.type(), column.format(), locale.value);
  }

  /**
   * Parses `text` as TSV (rows on line breaks, columns on tabs) and, anchored at `visibleRows[anchorRowIndex]`/`anchorField`'s
   * position within `visibleRows`/`columns`, builds the `{ row, field, value }` updates for every
   * pasted cell that lands on both an existing row and an *editable* column — same semantics as
   * grid-angular's `pasteAt()`. A pasted block bigger than the remaining grid, or touching a
   * non-editable column, is simply clipped there. Calls `onCellsPaste` once, only if there's at
   * least one update.
   */
  function pasteAt(anchorRowIndex: number, anchorField: string, text: string): void {
    const cols = visibleColumns.value;
    const pageRows = visibleRows.value;
    const colIndex = cols.findIndex(c => c.field === anchorField);
    if (anchorRowIndex === -1 || colIndex === -1) return;

    const updates: InanduGridCellPaste[] = [];
    // Excel/Sheets terminate a copied block with a trailing line break; without stripping it, the
    // split below would produce one extra, entirely-empty phantom row past the real data.
    const pastedRows = text.replace(/\r\n$|\r$|\n$/, '').split(/\r\n|\r|\n/).map(line => line.split('\t'));
    pastedRows.forEach((pastedRow, rOffset) => {
      const targetRow = pageRows[anchorRowIndex + rOffset];
      if (!targetRow) return;
      pastedRow.forEach((cellText, cOffset) => {
        const targetColumn = cols[colIndex + cOffset];
        if (!targetColumn || !targetColumn.editable) return;
        updates.push({ row: targetRow, field: targetColumn.field, value: parsePastedCellValue(cellText, targetColumn.type ?? 'string') });
      });
    });
    if (updates.length > 0) current().onCellsPaste?.(updates);
  }

  /** A column's current rendered width: a resize-drag override if one exists, else its declared `width` (defaulting to 80, same fallback grid-angular's `effectiveWidth() || 80` uses). Same semantics as grid-angular's `effectiveWidth`. */
  function effectiveWidth(field: string): number {
    const override = columnWidths.value[field];
    if (override !== undefined) return override;
    return orderedColumns.value.find(column => column.field === field)?.width ?? 80;
  }

  /** Whether `field` has a resize-drag (or `setColumnWidth()`) override — the caller uses this to decide whether to render an explicit `width` at all, vs. leaving an un-sized column to auto-size to content. */
  function isColumnResized(field: string): boolean {
    return columnWidths.value[field] !== undefined;
  }

  /** Sets a column's width directly, bypassing the resize-handle drag — clamped to `MIN_COLUMN_WIDTH`, same floor the drag handle enforces. No-ops if `field` doesn't match any current column. Same semantics as grid-angular's `setColumnWidth`. */
  function setColumnWidth(field: string, width: number): void {
    if (!orderedColumns.value.some(column => column.field === field)) return;
    columnWidths.value = { ...columnWidths.value, [field]: Math.max(MIN_COLUMN_WIDTH, width) };
  }

  function onRowDragStart(row: InanduGridRow): void {
    draggingRow.value = row;
  }

  function isRowExpanded(row: InanduGridRow): boolean {
    return expandedRows.value.has(row);
  }

  /** Toggles `row`'s master-detail visibility. Multiple rows can be expanded at once by default; `singleDetailExpand` collapses any other expanded row first, accordion-style. Same semantics as grid-angular's `toggleRowExpanded`. */
  function toggleRowExpanded(row: InanduGridRow): void {
    const expanded = expandedRows.value;
    const next = current().singleDetailExpand ? new Set<InanduGridRow>() : new Set(expanded);
    if (expanded.has(row)) next.delete(row);
    else next.add(row);
    expandedRows.value = next;
  }

  /** Dropping a dragged row onto another row — inserts the dragged row immediately before the target, mirroring `onColumnDrop`'s semantics. Same as grid-angular's `onRowDrop`, operating over `sortedFilteredRows` (grid-angular's `sortedData()`). */
  function onRowDrop(targetRow: InanduGridRow): void {
    const draggedRow = draggingRow.value;
    draggingRow.value = undefined;
    if (!draggedRow || draggedRow === targetRow) return;

    const reordered = [...sortedFilteredRows.value];
    const fromIndex = reordered.indexOf(draggedRow);
    let toIndex = reordered.indexOf(targetRow);
    if (fromIndex === -1 || toIndex === -1) return;

    reordered.splice(fromIndex, 1);
    if (fromIndex < toIndex) toIndex--; // the removal above shifted every later index down by one
    reordered.splice(toIndex, 0, draggedRow);
    current().onRowOrderChange?.(reordered);
  }

  /**
   * `field`'s current pin side, considering any runtime override (`setColumnPinned()`) — an
   * override if one was ever set for this field, else its own declared `pinned`. `undefined` means
   * not pinned. Same semantics as grid-angular's `columnPinnedSide`.
   */
  function columnPinnedSide(field: string): InanduColumnStickySide | undefined {
    const override = pinnedOverrides.value[field];
    if (override === 'left' || override === 'right') return override;
    if (override === 'none') return undefined;
    return orderedColumns.value.find(column => column.field === field)?.pinned;
  }

  /** Pins `field` to `side` at runtime, or un-pins it when `side` is `undefined` — independent of that column's own declared `pinned`. See `columnPinnedSide`. Same semantics as grid-angular's `setColumnPinned`. */
  function setColumnPinned(field: string, side: InanduColumnStickySide | undefined): void {
    pinnedOverrides.value = { ...pinnedOverrides.value, [field]: side ?? 'none' };
  }

  /**
   * The `left` offset (px) a left-pinned column's `<th>`/`<td>` needs: the select-checkbox
   * column's width (always sticky-left, when rendered) plus every *other* left-pinned column's
   * `effectiveWidth` that renders before this one in `visibleColumns`. Same semantics as
   * grid-angular's `stickyOffset`.
   */
  function stickyOffset(field: string): number {
    let offset = selectable.value ? SELECT_COLUMN_WIDTH : 0;
    for (const other of visibleColumns.value) {
      if (other.field === field) break;
      if (columnPinnedSide(other.field) === 'left') offset += effectiveWidth(other.field);
    }
    return offset;
  }

  /** The `right` offset (px) a right-pinned column needs — the mirror image of `stickyOffset`, stacking from the table's right edge inward. Same semantics as grid-angular's `stickyOffsetRight`. */
  function stickyOffsetRight(field: string): number {
    let offset = 0;
    let seen = false;
    for (const other of visibleColumns.value) {
      if (other.field === field) {
        seen = true;
        continue;
      }
      if (seen && columnPinnedSide(other.field) === 'right') offset += effectiveWidth(other.field);
    }
    return offset;
  }

  function setPage(next: number): void {
    page.value = next;
  }

  function setGroupByField(field: string | undefined): void {
    groupByState.value = field;
  }

  return {
    get visibleColumns() {
      return visibleColumns.value;
    },
    /** Every column in current drag-reorder order, hidden ones included — same as grid-angular's `displayColumns()`. Most rendering should use `visibleColumns` instead; this is for callers (like a saved-view restore) that need to address a currently-hidden column too. */
    get allColumns() {
      return orderedColumns.value;
    },
    stickyOffset,
    stickyOffsetRight,
    columnPinnedSide,
    setColumnPinned,
    get hideableColumns() {
      return hideableColumns.value;
    },
    isColumnHidden,
    toggleColumnVisibility,
    setColumnOrder,
    get draggingField() {
      return draggingField.value;
    },
    onColumnDragStart,
    onColumnDrop,
    effectiveWidth,
    isColumnResized,
    setColumnWidth,
    get draggingRow() {
      return draggingRow.value;
    },
    onRowDragStart,
    onRowDrop,
    get hasTreeData() {
      return hasTreeData.value;
    },
    get treeRows() {
      return treeRows.value;
    },
    isTreeRowExpanded,
    toggleTreeRow,
    setAllTreeRowsExpanded,
    isRowExpanded,
    toggleRowExpanded,
    get hasVirtualScroll() {
      return hasVirtualScroll.value;
    },
    get visibleRows() {
      return visibleRows.value;
    },
    /** Same "what's on screen right now" set the select-all checkbox and CSV/Excel/PDF export use — the current page, or every group's rows while grouped. */
    get exportRows() {
      return selectionScopeRows.value;
    },
    /** Every row matching the current filter and sort, in sort order, regardless of pagination or grouping — same as grid-angular's `sortedData()`. Unlike `exportRows`, this never stops at one page: a full-dataset export/print reads from here instead. */
    get sortedRows() {
      return sortedFilteredRows.value;
    },
    get filteredRowCount() {
      return totalRowCount.value;
    },
    get locale() {
      return locale.value;
    },
    get sortCriteria() {
      return sortCriteria.value;
    },
    setSort,
    toggleSort,
    sortDirectionFor,
    sortPriorityFor,
    get filterValues() {
      return filterValues.value;
    },
    setFilterValue,
    clearAllFilters,
    get filterQuery() {
      return filterQuery.value;
    },
    setFilterQuery,
    get page() {
      return clampedPage.value;
    },
    setPage,
    get pageCount() {
      return paginationActive.value ? pageCount.value : 1;
    },
    get groupByField() {
      return groupByField.value;
    },
    setGroupByField,
    get groups() {
      return groups.value;
    },
    get totals() {
      return totals.value;
    },
    get selectedRows() {
      return selectedRows.value;
    },
    isRowSelected,
    toggleRowSelection,
    get allSelected() {
      return allSelected.value;
    },
    get someSelected() {
      return someSelected.value;
    },
    toggleSelectAll,
    clearSelection,
    get editableColumns() {
      return editableColumns.value;
    },
    get editingRow() {
      return editingRow.value;
    },
    get isAddingRow() {
      return isAddingRow.value;
    },
    get rowDraft() {
      return rowDraft.value;
    },
    get fieldErrors() {
      return fieldErrors.value;
    },
    get isValidating() {
      return isValidating.value;
    },
    isEditingRow,
    isAnotherRowEditing,
    startEditingRow,
    cancelRowEdit,
    setRowDraftValue,
    saveRow,
    deleteRow,
    deleteSelectedRows,
    startAddingRow,
    cancelAddRow,
    saveNewRow,
    validateCell,
    copyCellText,
    pasteAt,
  };
}

/** What `useInanduGrid()` returns — also what `<InanduGrid>` exposes as its `grid` template-ref property. */
export type InanduGridApi = ReturnType<typeof useInanduGrid>;

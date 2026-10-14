import { defineComponent, type CSSProperties, type PropType, type VNodeChild } from 'vue';
import type { InanduGridRow } from '../core';
import type { InanduGridColumn } from '../composables/useInanduGrid';
import type { InanduGridMessageKey } from '../utils/translate';

export type Translator = (key: InanduGridMessageKey, params?: Record<string, string | number>) => string;

/** Renders whatever VNode children it's handed — how a slot or a column's `renderCell`/`renderHeader`/`renderEditor` result is mounted from inside a template. */
export const RenderNodes = defineComponent({
  name: 'InanduGridRenderNodes',
  props: { nodes: { type: null as unknown as PropType<VNodeChild>, default: null } },
  setup(props) {
    return () => props.nodes as never;
  },
});

/**
 * Everything a `<DataRow>` needs from the grid, bundled into one prop rather than ~30 — the Vue
 * counterpart of the React port's spread `rowProps`. Built once per render by `<InanduGrid>`.
 */
export interface RowContext {
  columns: InanduGridColumn[];
  t: Translator;
  selectable: boolean;
  selectColumnStyle: CSSProperties | undefined;
  columnStyle: (column: InanduGridColumn) => CSSProperties;
  isRowSelected: (row: InanduGridRow) => boolean;
  toggleRowSelection: (row: InanduGridRow) => void;
  hasRowActions: boolean;
  editableColumnCount: number;
  isEditingRow: (row: InanduGridRow) => boolean;
  isAnotherRowEditing: (row: InanduGridRow) => boolean;
  startEditingRow: (row: InanduGridRow) => void;
  cancelRowEdit: () => void;
  saveRow: (row: InanduGridRow) => void;
  deleteRow: (row: InanduGridRow) => void;
  deletable: boolean;
  rowDraft: Record<string, unknown>;
  fieldErrors: Record<string, string>;
  isValidating: boolean;
  setRowDraftValue: (field: string, value: unknown) => void;
  /** A cell's display content: the `#cell-<field>` slot, else the column's `renderCell`, else the formatted value. */
  cellContent: (column: InanduGridColumn, row: InanduGridRow) => VNodeChild;
  /** A custom editor (`#editor-<field>` slot or `renderEditor`), or `undefined` to fall back to the built-in `<EditCell>`. */
  editorContent: (column: InanduGridColumn, row: InanduGridRow) => VNodeChild | undefined;
  /** Master-detail content for an expanded row (`#detail` slot or `renderDetail`). */
  detailContent: (row: InanduGridRow) => VNodeChild;
  /** Adds the `tabindex` `onTableKeyDown` resolves a Ctrl+C/Ctrl+V onto — `data-row-index`/`data-field` are always present (flat, non-grouped render path only), same as grid-angular. */
  clipboard: boolean;
  /** Marks cells `.inandu-cell-range-selected` and wires the drag/shift-click gesture — only in the flat, non-grouped, non-tree, non-virtualized render path, same restriction grid-angular's `cellRangeSelection` has. */
  cellRangeSelection: boolean;
  isCellInRange: (rowIndex: number, colIndex: number) => boolean;
  onCellRangeMouseDown: (event: MouseEvent, rowIndex: number, colIndex: number) => void;
  onCellRangeMouseEnter: (rowIndex: number, colIndex: number) => void;
  /** Column count a full-width row (`colspan`) must span: `columns.length` plus every leading/trailing extra column. */
  extraColumnCount: number;
}

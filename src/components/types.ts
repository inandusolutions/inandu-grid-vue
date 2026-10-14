import type { InanduGridRow } from '../core';

/** The currently selected cell range — see `<InanduGrid cell-range-selection>` and its `cell-range-change` event. `rows`/`fields` are the full row objects and field names spanning the selected rectangle, in `visibleRows`/`visibleColumns` order. */
export interface InanduGridCellRangeSelection {
  rows: InanduGridRow[];
  fields: string[];
}

import { describe, expect, it, vi } from 'vitest';
import { nextTick, ref } from 'vue';
import { useInanduGrid } from './useInanduGrid';

const columns = [
  { field: 'name', headerText: 'Name' },
  { field: 'age', headerText: 'Age', type: 'number' as const, width: 60 },
];

const rows = [{ name: 'Ada', age: 30 }];

describe('useInanduGrid: clearAllFilters', () => {
  it('removes every column filter entry at once', () => {
    const grid = useInanduGrid({ rows, columns });
    grid.setFilterValue('name', { text: 'a' });
    grid.setFilterValue('age', { min: '10' });
    expect(grid.filterValues).toEqual({ name: { text: 'a' }, age: { min: '10' } });

    grid.clearAllFilters();
    expect(grid.filterValues).toEqual({});
  });
});

describe('useInanduGrid: allColumns', () => {
  it('includes hidden columns, unlike visibleColumns', () => {
    const grid = useInanduGrid({ rows, columns });
    grid.toggleColumnVisibility('age');

    expect(grid.visibleColumns.map(c => c.field)).toEqual(['name']);
    expect(grid.allColumns.map(c => c.field)).toEqual(['name', 'age']);
  });
});

describe('useInanduGrid: extraRowFilter', () => {
  const people = [
    { name: 'Ada', age: 30 },
    { name: 'Alan', age: 25 },
    { name: 'Grace', age: 40 },
  ];

  it('ANDs onto free-text and column filters', () => {
    const grid = useInanduGrid({ rows: people, columns, extraRowFilter: row => (row.age as number) >= 30 });
    expect(grid.sortedRows.map(r => r.name)).toEqual(['Ada', 'Grace']);

    grid.setFilterQuery('a');
    expect(grid.sortedRows.map(r => r.name)).toEqual(['Ada', 'Grace']); // both still contain "a"
  });

  it('unset means no extra filtering', () => {
    const grid = useInanduGrid({ rows: people, columns });
    expect(grid.sortedRows.length).toBe(3);
  });

  it('also applies in tree mode', () => {
    const treeRows = [
      { name: 'Ada', age: 30, kids: [{ name: 'Kid1', age: 5 }] },
      { name: 'Alan', age: 25, kids: [] },
    ];
    const grid = useInanduGrid({
      rows: treeRows,
      columns,
      treeChildrenKey: 'kids',
      treeDefaultExpanded: 'all',
      extraRowFilter: row => (row.age as number) >= 30,
    });
    const names = grid.treeRows.map(t => t.row.name);
    expect(names).not.toContain('Alan');
    expect(names).toContain('Ada');
  });
});

describe('useInanduGrid: sortedRows', () => {
  it('includes every filtered/sorted row regardless of pagination, unlike exportRows', () => {
    const manyRows = Array.from({ length: 5 }, (_, i) => ({ name: `Row ${i}`, age: i }));
    const grid = useInanduGrid({ rows: manyRows, columns, pageSize: 2 });

    expect(grid.exportRows.length).toBe(2);
    expect(grid.sortedRows.length).toBe(5);
  });

  it('reflects the active filter and sort, same as exportRows would if unpaginated', () => {
    const grid = useInanduGrid({ rows, columns });
    grid.setSort([{ field: 'age', direction: 'desc' }]);
    expect(grid.sortedRows.map(r => r.name)).toEqual(['Ada']);
  });
});

describe('useInanduGrid: locale', () => {
  it('exposes the resolved locale, defaulting to "en"', () => {
    const grid = useInanduGrid({ rows, columns });
    expect(grid.locale).toBe('en');
  });

  it('reflects an explicit locale option', () => {
    const grid = useInanduGrid({ rows, columns, locale: 'es' });
    expect(grid.locale).toBe('es');
  });
});

describe('useInanduGrid: runtime column pin/unpin', () => {
  it("columnPinnedSide falls back to the column's own declared pinned when no override was set", () => {
    const pinned = [{ ...columns[0], pinned: 'left' as const }, columns[1]];
    const grid = useInanduGrid({ rows, columns: pinned });
    expect(grid.columnPinnedSide('name')).toBe('left');
    expect(grid.columnPinnedSide('age')).toBeUndefined();
  });

  it('setColumnPinned pins an otherwise-unpinned column at runtime, independent of its declared config', () => {
    const grid = useInanduGrid({ rows, columns, selectable: true });
    expect(grid.columnPinnedSide('age')).toBeUndefined();

    grid.setColumnPinned('age', 'right');
    expect(grid.columnPinnedSide('age')).toBe('right');
    // stickyOffsetRight reflects the runtime override immediately.
    expect(grid.stickyOffsetRight('name')).toBe(60); // age's own width
  });

  it('setColumnPinned(field, undefined) un-pins a column that declared pinned: "left"', () => {
    const pinned = [{ ...columns[0], pinned: 'left' as const }, columns[1]];
    const grid = useInanduGrid({ rows, columns: pinned });
    expect(grid.columnPinnedSide('name')).toBe('left');

    grid.setColumnPinned('name', undefined);
    expect(grid.columnPinnedSide('name')).toBeUndefined();
  });
});

describe('useInanduGrid: reactive options', () => {
  it('follows a reactive rows source passed through a getter', async () => {
    const data = ref([{ name: 'Ada', age: 30 }]);
    const grid = useInanduGrid(() => ({ rows: data.value, columns }));
    expect(grid.filteredRowCount).toBe(1);

    data.value = [...data.value, { name: 'Alan', age: 25 }];
    await nextTick();
    expect(grid.filteredRowCount).toBe(2);
  });

  it('re-seeds tree expansion when a new rows array arrives, but not on unrelated changes', () => {
    const first = [{ name: 'Fruits', age: 1, kids: [{ name: 'Apple', age: 2 }] }];
    const data = ref(first);
    const grid = useInanduGrid(() => ({ rows: data.value, columns, treeChildrenKey: 'kids', treeDefaultExpanded: 'all' }));
    expect(grid.treeRows.map(t => t.row.name)).toEqual(['Fruits', 'Apple']);

    grid.toggleTreeRow(grid.treeRows[0].row); // user collapses
    grid.setFilterQuery(''); // unrelated state change must not undo that
    expect(grid.treeRows.map(t => t.row.name)).toEqual(['Fruits']);

    data.value = [{ name: 'Veg', age: 1, kids: [{ name: 'Carrot', age: 2 }] }];
    expect(grid.treeRows.map(t => t.row.name)).toEqual(['Veg', 'Carrot']);
  });
});

describe('useInanduGrid: rowId', () => {
  const cols = [{ field: 'name', headerText: 'Name' }];
  const page1 = () => [
    { id: 1, name: 'Ada' },
    { id: 2, name: 'Alan' },
  ];

  it('keeps the selection when a refetch returns new objects for the same rows', () => {
    const data = ref(page1());
    const grid = useInanduGrid(() => ({ rows: data.value, columns: cols }));
    grid.toggleRowSelection(grid.visibleRows[0]);
    expect(grid.selectedRows.size).toBe(1);

    const fresh = [
      { id: 1, name: 'Ada (edited)' },
      { id: 2, name: 'Alan' },
    ];
    data.value = fresh;

    expect(grid.isRowSelected(fresh[0])).toBe(true);
    expect([...grid.selectedRows][0]).toMatchObject({ id: 1, name: 'Ada (edited)' }); // the fresh data, not the stale one
  });

  it('keeps selected rows that are no longer in the current page', () => {
    const data = ref(page1());
    const grid = useInanduGrid(() => ({ rows: data.value, columns: cols }));
    grid.toggleRowSelection(grid.visibleRows[0]);

    data.value = [{ id: 3, name: 'Grace' }];

    expect(grid.selectedRows.size).toBe(1);
    expect([...grid.selectedRows][0]).toMatchObject({ id: 1 });
  });

  it('uses the field or function given as rowId', () => {
    const data = [{ sku: 'A', name: 'x' }];
    const byField = useInanduGrid({ rows: data, columns: cols, rowId: 'sku' });
    byField.toggleRowSelection(data[0]);
    expect(byField.isRowSelected({ sku: 'A', name: 'other object' })).toBe(true);

    const byFn = useInanduGrid({ rows: data, columns: cols, rowId: r => String(r['sku']) + '!' });
    byFn.toggleRowSelection(data[0]);
    expect(byFn.isRowSelected({ sku: 'A' })).toBe(true);
    expect(byFn.isRowSelected({ sku: 'B' })).toBe(false);
  });

  it('falls back to object identity when rows have no id', () => {
    const data = [{ name: 'Ada' }, { name: 'Ada' }];
    const grid = useInanduGrid({ rows: data, columns: cols });
    grid.toggleRowSelection(data[0]);

    expect(grid.isRowSelected(data[0])).toBe(true);
    expect(grid.isRowSelected(data[1])).toBe(false);
  });

  it('gives unique keys, even without ids or with an id equal to an index', () => {
    const data = [{ name: 'a' }, { name: 'b' }, { id: 1, name: 'c' }, { id: '1', name: 'd' }];
    const grid = useInanduGrid({ rows: data, columns: cols });

    const keys = data.map(r => grid.rowKeyOf(r));
    expect(new Set(keys).size).toBe(4);
    expect(grid.rowKeyOf(data[0])).toBe(keys[0]); // stable for the same object
  });

  it('does not undo the user’s tree expand/collapse when the parent passes a new derived array', () => {
    const make = () => [
      { id: 1, name: 'root', kids: [{ id: 2, name: 'child' }] },
      { id: 3, name: 'root2', kids: [{ id: 4, name: 'child2' }] },
    ];
    const data = ref(make());
    const grid = useInanduGrid(() => ({ rows: data.value, columns: cols, treeChildrenKey: 'kids', treeDefaultExpanded: 'all' }));
    expect(grid.treeRows.length).toBe(4);

    grid.toggleTreeRow(grid.treeRows[0].row); // collapse root
    expect(grid.treeRows.length).toBe(3);

    data.value = make(); // same ids, brand new objects

    expect(grid.treeRows.length).toBe(3); // still collapsed
  });

  it('expands newly arrived tree nodes by the default, leaving the others alone', () => {
    const data = ref([{ id: 1, name: 'root', kids: [{ id: 2, name: 'child' }] }]);
    const grid = useInanduGrid(() => ({ rows: data.value, columns: cols, treeChildrenKey: 'kids', treeDefaultExpanded: 'all' }));
    grid.toggleTreeRow(grid.treeRows[0].row); // collapse 1
    expect(grid.treeRows.length).toBe(1);

    data.value = [
      { id: 1, name: 'root', kids: [{ id: 2, name: 'child' }] },
      { id: 5, name: 'new', kids: [{ id: 6, name: 'new child' }] },
    ];

    expect(grid.treeRows.length).toBe(3); // root collapsed (1) + new root + its child
  });
});

describe('useInanduGrid: grid-core 0.1.2 behaviour', () => {
  const editable = [
    { field: 'name', headerText: 'Name', editable: true },
    { field: 'qty', headerText: 'Qty', type: 'number' as const, editable: true },
    { field: 'on', headerText: 'On', type: 'boolean' as const, editable: true },
  ];

  it('pastes a number in the locale of the grid and skips what a column cannot hold', () => {
    const onCellsPaste = vi.fn();
    const data = [{ name: 'a', qty: 1, on: false }];
    const grid = useInanduGrid({ rows: data, columns: editable, locale: 'es', onCellsPaste });

    grid.pasteAt(0, 'name', 'x\t1.234,5\tquizás');

    expect(onCellsPaste).toHaveBeenCalledWith([
      { row: data[0], field: 'name', value: 'x' },
      { row: data[0], field: 'qty', value: 1234.5 },
    ]); // 'quizás' is not a boolean: that cell is left alone
  });

  it('sorts a numeric column by value even when the cells are text', () => {
    const data = [{ qty: '10' }, { qty: '9' }, { qty: '2' }];
    const grid = useInanduGrid({ rows: data, columns: [{ field: 'qty', type: 'number' as const }] });
    grid.setSort([{ field: 'qty', direction: 'asc' }]);

    expect(grid.sortedRows.map(r => r.qty)).toEqual(['2', '9', '10']);
  });

  it('shows dates in the timeZone of the column', () => {
    const data = [{ at: '2024-01-05T00:00:00Z' }];
    const cols = [{ field: 'at', type: 'date' as const, format: 'YYYY-MM-DD', timeZone: 'America/Bogota' }];
    const grid = useInanduGrid({ rows: data, columns: cols });

    expect(grid.copyCellText(0, 'at')).toBe('2024-01-04');
  });
});

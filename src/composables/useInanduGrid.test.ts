import { describe, expect, it } from 'vitest';
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

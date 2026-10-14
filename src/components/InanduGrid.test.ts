import { fireEvent, render, screen, waitFor } from '@testing-library/vue';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mount } from '@vue/test-utils';
import { h } from 'vue';
import InanduGrid from './InanduGrid.vue';

const columns = [
  { field: 'name', headerText: 'Name' },
  { field: 'age', headerText: 'Age', type: 'number' as const },
];

const rows = [
  { name: 'Beatriz', age: 41 },
  { name: 'Ana', age: 30 },
];

const salesColumns = [
  { field: 'region', headerText: 'Region' },
  { field: 'amount', headerText: 'Amount', type: 'number' as const, aggregate: 'sum' as const },
];

const salesRows = [
  { region: 'North', amount: 10 },
  { region: 'South', amount: 5 },
  { region: 'North', amount: 20 },
];

const editableColumns = [
  { field: 'name', headerText: 'Name', editable: true, required: true },
  { field: 'age', headerText: 'Age', type: 'number' as const, editable: true, min: 0, max: 120 },
];

type Props = Record<string, unknown>;
const renderGrid = (props: Props, slots?: Record<string, unknown>) => render(InanduGrid, { props, slots } as never);

describe('InanduGrid', () => {
  it('renders headers and rows', () => {
    renderGrid({ rows, columns });
    expect(screen.getByRole('columnheader', { name: 'Sort by Name' })).toBeInTheDocument();
    expect(screen.getByText('Beatriz')).toBeInTheDocument();
    expect(screen.getByText('30')).toBeInTheDocument();
  });

  it('sorts by a column on header click', async () => {
    renderGrid({ rows, columns });
    await fireEvent.click(screen.getByRole('columnheader', { name: 'Sort by Name' }));
    const cells = screen.getAllByRole('cell');
    expect(cells[0]).toHaveTextContent('Ana');
  });

  it('matches the free-text search against any column', async () => {
    renderGrid({ rows, columns });
    await fireEvent.update(screen.getByLabelText('Search'), '41');
    expect(screen.getByText('Beatriz')).toBeInTheDocument();
    expect(screen.queryByText('Ana')).not.toBeInTheDocument();
  });

  it('filters a string column by its text filter', async () => {
    renderGrid({ rows, columns });
    await fireEvent.update(screen.getByLabelText('Filter Name'), 'ana');
    expect(screen.getByText('Ana')).toBeInTheDocument();
    expect(screen.queryByText('Beatriz')).not.toBeInTheDocument();
  });

  it('filters a number column by its min/max range', async () => {
    renderGrid({ rows, columns });
    await fireEvent.update(screen.getByLabelText('Filter Age Min'), '35');
    expect(screen.getByText('Beatriz')).toBeInTheDocument();
    expect(screen.queryByText('Ana')).not.toBeInTheDocument();
  });

  it('shift-clicking a second header builds a multi-column sort', async () => {
    const tiedRows = [
      { name: 'Carla', age: 30 },
      { name: 'Ana', age: 30 },
      { name: 'Beto', age: 20 },
    ];
    renderGrid({ rows: tiedRows, columns });

    await fireEvent.click(screen.getByRole('columnheader', { name: 'Sort by Age' })); // primary: age asc
    await fireEvent.click(screen.getByRole('columnheader', { name: 'Sort by Name' }), { shiftKey: true }); // secondary: name asc, ties broken

    const cells = screen.getAllByRole('cell').map(cell => cell.textContent);
    // Beto(20) first, then the age-30 tie broken by name: Ana, Carla.
    expect(cells.slice(0, 6)).toEqual(['Beto', '20', 'Ana', '30', 'Carla', '30']);
    // Both sorted columns show their multi-sort priority badge.
    expect(screen.getByRole('columnheader', { name: 'Sort by Age' })).toHaveTextContent('1');
    expect(screen.getByRole('columnheader', { name: 'Sort by Name' })).toHaveTextContent('2');
  });

  it('paginates rows and navigates with Prev/Next', async () => {
    renderGrid({ rows, columns, pageSize: 1 });
    expect(screen.getByText(/Page 1 of 2/)).toBeInTheDocument();
    expect(screen.getByText('Beatriz')).toBeInTheDocument();
    expect(screen.queryByText('Ana')).not.toBeInTheDocument();

    await fireEvent.click(screen.getByText('Next page ›'));
    expect(screen.getByText('Ana')).toBeInTheDocument();
    expect(screen.getByText('Next page ›')).toBeDisabled();
  });

  it('groups rows by a column with per-group and grand-total aggregates', async () => {
    renderGrid({ rows: salesRows, columns: salesColumns });
    await fireEvent.update(screen.getByLabelText('Group by'), 'region');

    // "North"/"South" render both in the group header and in each row's own region cell.
    expect(screen.getAllByText('North').length).toBeGreaterThan(0);
    expect(screen.getAllByText('South').length).toBeGreaterThan(0);
    expect(screen.getByText(/Amount Σ: 30/)).toBeInTheDocument(); // North's subtotal: 10 + 20
    expect(screen.getByText(/Amount Σ: 35/)).toBeInTheDocument(); // grand total: 10 + 5 + 20
  });

  it('bypasses pagination while grouped', async () => {
    renderGrid({ rows: salesRows, columns: salesColumns, pageSize: 1 });
    await fireEvent.update(screen.getByLabelText('Group by'), 'region');
    expect(screen.queryByText(/Page \d+ of \d+/)).not.toBeInTheDocument();
    expect(screen.getAllByText('North').length).toBeGreaterThan(0);
    expect(screen.getAllByText('South').length).toBeGreaterThan(0);
  });

  it('selects individual rows and reports the selection', async () => {
    const onSelectionChange = vi.fn();
    renderGrid({ rows, columns, selectable: true, onSelectionChange });

    const rowCheckboxes = screen.getAllByLabelText(/Select row/);
    await fireEvent.click(rowCheckboxes[0]);

    expect(onSelectionChange).toHaveBeenLastCalledWith([rows[0]]);
  });

  it('selects and deselects all rows with the header checkbox', async () => {
    const onSelectionChange = vi.fn();
    renderGrid({ rows, columns, selectable: true, onSelectionChange });

    await fireEvent.click(screen.getByLabelText('Select all rows'));
    expect(onSelectionChange).toHaveBeenLastCalledWith(rows);

    await fireEvent.click(screen.getByLabelText('Select all rows'));
    expect(onSelectionChange).toHaveBeenLastCalledWith([]);
  });

  it('shows the MsgNoData message when there are no rows to show', () => {
    renderGrid({ rows: [], columns });
    expect(screen.getByText('No data')).toBeInTheDocument();
  });

  it('translates built-in UI strings via the lang prop', () => {
    renderGrid({ rows: [], columns, lang: 'es', exportable: true });
    expect(screen.getByText('Sin datos')).toBeInTheDocument();
    expect(screen.getByText('Exportar CSV')).toBeInTheDocument();
  });

  // saveRow()/saveNewRow() are async (they always await validateAndParseDraft(), even with no
  // asyncValidator involved), so their state updates land a microtask after the click — these use
  // Testing Library's `findBy*` (which polls) rather than `getBy*` to observe the result.

  it('edits a row and saves valid values', async () => {
    const onRowSave = vi.fn();
    renderGrid({ rows, columns: editableColumns, onRowSave });

    await fireEvent.click(screen.getAllByText('Edit')[0]);
    await fireEvent.update(screen.getByLabelText('Edit Age'), '42');
    await fireEvent.click(screen.getByText('Save'));
    await waitFor(() => expect(screen.queryByLabelText('Edit Age')).not.toBeInTheDocument());

    // Edit mode exits — "Edit"/"Delete" buttons come back for every row.
    expect(screen.getAllByText('Edit')).toHaveLength(2);
    expect(onRowSave).toHaveBeenCalledWith({ row: rows[0], values: { name: 'Beatriz', age: 42 } });
  });

  it('blocks the save and shows an inline error when a required field is cleared', async () => {
    const onRowSave = vi.fn();
    renderGrid({ rows, columns: editableColumns, onRowSave });

    await fireEvent.click(screen.getAllByText('Edit')[0]);
    await fireEvent.update(screen.getByLabelText('Edit Name'), '');
    await fireEvent.click(screen.getByText('Save'));

    expect(await screen.findByText('This field is required')).toBeInTheDocument();
    expect(onRowSave).not.toHaveBeenCalled();
  });

  it('rejects a value outside min/max with the interpolated message', async () => {
    renderGrid({ rows, columns: editableColumns });

    await fireEvent.click(screen.getAllByText('Edit')[0]);
    await fireEvent.update(screen.getByLabelText('Edit Age'), '200');
    await fireEvent.click(screen.getByText('Save'));

    expect(await screen.findByText('Must be at most 120')).toBeInTheDocument();
  });

  it('adds a new row via the Add row trigger', async () => {
    const onRowCreate = vi.fn();
    renderGrid({ rows, columns: editableColumns, creatable: true, onRowCreate });

    await fireEvent.click(screen.getByText('Add row'));
    await fireEvent.update(screen.getByLabelText('Edit Name'), 'Carla');
    await fireEvent.update(screen.getByLabelText('Edit Age'), '25');
    await fireEvent.click(screen.getByText('Save'));

    // The "Add row" trigger comes back once the draft is dismissed after a successful save.
    expect(await screen.findByText('Add row')).toBeInTheDocument();
    expect(onRowCreate).toHaveBeenCalledWith({ name: 'Carla', age: 25 });
  });

  it('deletes a row, confirming via window.confirm when deleteConfirmMessage is set', async () => {
    const onRowDelete = vi.fn();
    const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(true);
    renderGrid({ rows, columns, deletable: true, deleteConfirmMessage: 'Sure?', onRowDelete });

    await fireEvent.click(screen.getAllByText('Delete')[0]);

    expect(confirmSpy).toHaveBeenCalledWith('Sure?');
    expect(onRowDelete).toHaveBeenCalledWith(rows[0]);
    confirmSpy.mockRestore();
  });

  it('does not delete when window.confirm is cancelled', async () => {
    const onRowDelete = vi.fn();
    const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(false);
    renderGrid({ rows, columns, deletable: true, deleteConfirmMessage: 'Sure?', onRowDelete });

    await fireEvent.click(screen.getAllByText('Delete')[0]);

    expect(onRowDelete).not.toHaveBeenCalled();
    confirmSpy.mockRestore();
  });

  it('bulk-deletes every selected row and clears the selection', async () => {
    const onRowsDelete = vi.fn();
    renderGrid({ rows, columns, selectable: true, deletable: true, onRowsDelete });

    await fireEvent.click(screen.getByLabelText('Select all rows'));
    await fireEvent.click(screen.getByText(/Delete selected/));

    expect(onRowsDelete).toHaveBeenCalledWith(rows);
    expect(screen.getByLabelText('Select all rows')).not.toBeChecked();
  });

  it('shows an export toolbar only when exportable is set', async () => {
    const { rerender } = renderGrid({ rows, columns });
    expect(screen.queryByText('Export CSV')).not.toBeInTheDocument();

    await rerender({ rows, columns, exportable: true });
    expect(screen.getByText('Export CSV')).toBeInTheDocument();
    expect(screen.getByText('Export Excel')).toBeInTheDocument();
    expect(screen.getByText('Export PDF')).toBeInTheDocument();
    expect(screen.getByText('Print')).toBeInTheDocument();
  });

  it('prints via a new window with a plain table, and triggers the print dialog on it', async () => {
    const printWindow = { document: { write: vi.fn(), close: vi.fn() }, focus: vi.fn(), print: vi.fn() };
    const openSpy = vi.spyOn(window, 'open').mockReturnValue(printWindow as unknown as Window);

    renderGrid({ rows, columns, exportable: true });
    vi.useFakeTimers();
    await fireEvent.click(screen.getByText('Print'));
    vi.runAllTimers();

    expect(openSpy).toHaveBeenCalledWith('', '_blank');
    expect(printWindow.document.write).toHaveBeenCalledWith(expect.stringContaining('Beatriz'));
    expect(printWindow.print).toHaveBeenCalled();

    vi.useRealTimers();
    openSpy.mockRestore();
  });

  it('copies the focused cell text with Ctrl+C', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true });

    renderGrid({ rows, columns, clipboard: true });
    await fireEvent.keyDown(screen.getByText('Beatriz'), { key: 'c', ctrlKey: true });

    expect(writeText).toHaveBeenCalledWith('Beatriz');
  });

  it('pastes TSV text onto editable cells anchored at the focused cell with Ctrl+V', async () => {
    const readText = vi.fn().mockResolvedValue('Carla\t50');
    Object.defineProperty(navigator, 'clipboard', { value: { readText }, configurable: true });
    const onCellsPaste = vi.fn();

    renderGrid({ rows, columns: editableColumns, clipboard: true, onCellsPaste });
    await fireEvent.keyDown(screen.getByText('Beatriz'), { key: 'v', ctrlKey: true });

    await waitFor(() =>
      expect(onCellsPaste).toHaveBeenCalledWith([
        { row: rows[0], field: 'name', value: 'Carla' },
        { row: rows[0], field: 'age', value: 50 },
      ]),
    );
  });

  it('ignores Ctrl+C/Ctrl+V when clipboard is not enabled', async () => {
    const writeText = vi.fn();
    Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true });

    renderGrid({ rows, columns });
    await fireEvent.keyDown(screen.getByText('Beatriz'), { key: 'c', ctrlKey: true });

    expect(writeText).not.toHaveBeenCalled();
  });

  it('hides and re-shows a column via the columns toggle popup', async () => {
    renderGrid({ rows, columns, columnToggle: true });

    expect(screen.getByRole('columnheader', { name: 'Sort by Age' })).toBeInTheDocument();
    await fireEvent.click(screen.getByLabelText('Toggle Age'));
    expect(screen.queryByRole('columnheader', { name: 'Sort by Age' })).not.toBeInTheDocument();

    await fireEvent.click(screen.getByLabelText('Toggle Age'));
    expect(screen.getByRole('columnheader', { name: 'Sort by Age' })).toBeInTheDocument();
  });

  it('refuses to hide the only remaining visible column', async () => {
    renderGrid({ rows, columns, columnToggle: true });

    await fireEvent.click(screen.getByLabelText('Toggle Age'));
    await fireEvent.click(screen.getByLabelText('Toggle Name'));

    // Still just Age hidden — Name (the last one standing) refused to hide, and its checkbox says so.
    expect(screen.getByRole('columnheader', { name: 'Sort by Name' })).toBeInTheDocument();
    expect(screen.getByLabelText('Toggle Name')).toBeChecked();
  });

  it("stacks left-pinned columns, offset by each other's width plus the select column", () => {
    const pinnedColumns = [
      { field: 'name', headerText: 'Name', pinned: 'left' as const, width: 100 },
      { field: 'age', headerText: 'Age', type: 'number' as const, pinned: 'left' as const, width: 60 },
    ];
    renderGrid({ rows, columns: pinnedColumns, selectable: true });

    const nameHeader = screen.getByRole('columnheader', { name: 'Sort by Name' });
    const ageHeader = screen.getByRole('columnheader', { name: 'Sort by Age' });
    expect(nameHeader.style.position).toBe('sticky');
    expect(nameHeader.style.left).toBe('36px'); // SELECT_COLUMN_WIDTH
    expect(ageHeader.style.left).toBe('136px'); // 36 + name's own 100px width
  });

  it('stacks right-pinned columns from the table edge inward', () => {
    const pinnedColumns = [
      { field: 'name', headerText: 'Name' },
      { field: 'age', headerText: 'Age', type: 'number' as const, pinned: 'right' as const, width: 60 },
      { field: 'note', headerText: 'Note', pinned: 'right' as const, width: 90 },
    ];
    renderGrid({ rows: [{ name: 'Beatriz', age: 41, note: 'x' }], columns: pinnedColumns });

    expect(screen.getByRole('columnheader', { name: 'Sort by Age' }).style.right).toBe('90px'); // note's width, which renders after it
    expect(screen.getByRole('columnheader', { name: 'Sort by Note' }).style.right).toBe('0px');
  });

  it('reorders columns by dragging a header and dropping it onto another', async () => {
    const threeColumns = [
      { field: 'name', headerText: 'Name' },
      { field: 'age', headerText: 'Age', type: 'number' as const },
      { field: 'note', headerText: 'Note' },
    ];
    renderGrid({ rows: [{ name: 'Beatriz', age: 41, note: 'x' }], columns: threeColumns });

    const nameHeader = screen.getByRole('columnheader', { name: 'Sort by Name' });
    const noteHeader = screen.getByRole('columnheader', { name: 'Sort by Note' });
    const dataTransfer = { setData: vi.fn() };
    await fireEvent.dragStart(nameHeader, { dataTransfer });
    await fireEvent.dragOver(noteHeader, { dataTransfer });
    await fireEvent.drop(noteHeader, { dataTransfer });

    const headerTexts = screen
      .getAllByRole('columnheader')
      .map(header => header.textContent?.trim())
      .filter(Boolean);
    expect(headerTexts).toEqual(['Age', 'Name', 'Note']);
  });

  it('does not reorder a column whose reorder is disabled', async () => {
    const threeColumns = [
      { field: 'name', headerText: 'Name', reorder: false },
      { field: 'age', headerText: 'Age', type: 'number' as const },
      { field: 'note', headerText: 'Note' },
    ];
    renderGrid({ rows: [{ name: 'Beatriz', age: 41, note: 'x' }], columns: threeColumns });

    const nameHeader = screen.getByRole('columnheader', { name: 'Sort by Name' });
    const noteHeader = screen.getByRole('columnheader', { name: 'Sort by Note' });
    const dataTransfer = { setData: vi.fn() };
    await fireEvent.dragStart(nameHeader, { dataTransfer });
    await fireEvent.drop(noteHeader, { dataTransfer });

    const headerTexts = screen
      .getAllByRole('columnheader')
      .map(header => header.textContent?.trim())
      .filter(Boolean);
    expect(headerTexts).toEqual(['Name', 'Age', 'Note']);
  });

  it('resizes a column by dragging its resize handle', async () => {
    renderGrid({ rows, columns });
    const nameHeader = screen.getByRole('columnheader', { name: 'Sort by Name' });
    const handle = nameHeader.querySelector('.inandu-grid-resize-handle')!;

    await fireEvent.mouseDown(handle, { clientX: 100 });
    await fireEvent.mouseMove(window, { clientX: 150 });
    await fireEvent.mouseUp(window);

    expect(nameHeader.style.width).toBe('130px'); // no declared width -> 80 default, +50px dragged
  });

  it('clamps a resize to MIN_COLUMN_WIDTH', async () => {
    renderGrid({ rows, columns });
    const nameHeader = screen.getByRole('columnheader', { name: 'Sort by Name' });
    const handle = nameHeader.querySelector('.inandu-grid-resize-handle')!;

    await fireEvent.mouseDown(handle, { clientX: 0 });
    await fireEvent.mouseMove(window, { clientX: -1000 });
    await fireEvent.mouseUp(window);

    expect(nameHeader.style.width).toBe('30px');
  });

  it('stops resizing once the mouse is released', async () => {
    renderGrid({ rows, columns });
    const nameHeader = screen.getByRole('columnheader', { name: 'Sort by Name' });
    const handle = nameHeader.querySelector('.inandu-grid-resize-handle')!;

    await fireEvent.mouseDown(handle, { clientX: 100 });
    await fireEvent.mouseMove(window, { clientX: 150 });
    await fireEvent.mouseUp(window);
    await fireEvent.mouseMove(window, { clientX: 400 });

    expect(nameHeader.style.width).toBe('130px');
  });

  describe('autosize', () => {
    // See src/utils/measureColumn.test.ts's own comment: this stubs offsetWidth (jsdom has no real
    // layout engine to measure against) so the surrounding logic — double-click wiring, the
    // autosize on/off gate, MAX_COLUMN_WIDTH clamping — is verified without pretending the actual
    // pixel measurement is meaningful here.
    let originalOffsetWidth: PropertyDescriptor | undefined;

    beforeEach(() => {
      originalOffsetWidth = Object.getOwnPropertyDescriptor(HTMLElement.prototype, 'offsetWidth');
      Object.defineProperty(HTMLElement.prototype, 'offsetWidth', {
        configurable: true,
        get(this: HTMLElement) {
          return (this.textContent ?? '').length * 10;
        },
      });
    });

    afterEach(() => {
      if (originalOffsetWidth) Object.defineProperty(HTMLElement.prototype, 'offsetWidth', originalOffsetWidth);
    });

    it('fits a column to its content on double-click when autosize is set', async () => {
      const wideRows = [{ name: 'A Genuinely Very Long Name Indeed' }];
      renderGrid({ rows: wideRows, columns, autosize: true });

      const nameHeader = screen.getByRole('columnheader', { name: 'Sort by Name' });
      const handle = nameHeader.querySelector('.inandu-grid-resize-handle')!;
      await fireEvent.dblClick(handle);

      // "A Genuinely Very Long Name Indeed" (33 chars) * 10 = 330, +4 padding = 334 (< MAX_COLUMN_WIDTH).
      expect(nameHeader.style.width).toBe('334px');
    });

    it('clamps autosize to MAX_COLUMN_WIDTH', async () => {
      const wideRows = [{ name: 'X'.repeat(200) }];
      renderGrid({ rows: wideRows, columns, autosize: true });

      const nameHeader = screen.getByRole('columnheader', { name: 'Sort by Name' });
      await fireEvent.dblClick(nameHeader.querySelector('.inandu-grid-resize-handle')!);

      expect(nameHeader.style.width).toBe('600px'); // MAX_COLUMN_WIDTH
    });

    it('is a no-op when autosize is not set', async () => {
      const wideRows = [{ name: 'A Genuinely Very Long Name Indeed' }];
      renderGrid({ rows: wideRows, columns });

      const nameHeader = screen.getByRole('columnheader', { name: 'Sort by Name' });
      await fireEvent.dblClick(nameHeader.querySelector('.inandu-grid-resize-handle')!);

      expect(nameHeader.style.width).toBe('');
    });
  });

  it('reorders rows by dragging a row handle and dropping it onto another row', async () => {
    const onRowOrderChange = vi.fn();
    renderGrid({ rows, columns, rowReorder: true, onRowOrderChange });

    const handles = screen.getAllByLabelText('Drag to reorder row');
    const beatrizRow = screen.getByText('Beatriz').closest('tr')!;
    const dataTransfer = { setData: vi.fn() };
    await fireEvent.dragStart(handles[1], { dataTransfer }); // Ana's handle (row 1)
    await fireEvent.drop(beatrizRow, { dataTransfer }); // dropped before Beatriz (row 0)

    expect(onRowOrderChange).toHaveBeenCalledWith([rows[1], rows[0]]); // Ana, then Beatriz
  });

  it('has no row drag handle while grouped', async () => {
    renderGrid({ rows: salesRows, columns: salesColumns, rowReorder: true });
    await fireEvent.update(screen.getByLabelText('Group by'), 'region');

    expect(screen.queryAllByLabelText('Drag to reorder row')).toHaveLength(0);
  });

  it('renders tree data collapsed by default and expands on toggle click', async () => {
    const treeRows = [
      { name: 'Fruits', kids: [{ name: 'Apple' }, { name: 'Banana' }] },
      { name: 'Vegetables', kids: [{ name: 'Carrot' }] },
    ];
    renderGrid({ rows: treeRows, columns: [{ field: 'name', headerText: 'Name' }], treeChildrenKey: 'kids' });

    expect(screen.getByText('Fruits')).toBeInTheDocument();
    expect(screen.queryByText('Apple')).not.toBeInTheDocument();

    await fireEvent.click(screen.getAllByLabelText('Expand row details')[0]);
    expect(screen.getByText('Apple')).toBeInTheDocument();
    expect(screen.getByText('Banana')).toBeInTheDocument();
    expect(screen.queryByText('Carrot')).not.toBeInTheDocument(); // Vegetables still collapsed
  });

  it('starts fully expanded with treeDefaultExpanded="all"', () => {
    const treeRows = [{ name: 'Fruits', kids: [{ name: 'Apple' }] }];
    renderGrid({ rows: treeRows, columns: [{ field: 'name', headerText: 'Name' }], treeChildrenKey: 'kids', treeDefaultExpanded: 'all' });

    expect(screen.getByText('Apple')).toBeInTheDocument();
  });

  it('keeps a matching descendant visible (and its ancestor auto-expanded) under free-text search', async () => {
    const treeRows = [
      { name: 'Fruits', kids: [{ name: 'Apple' }, { name: 'Banana' }] },
      { name: 'Vegetables', kids: [{ name: 'Carrot' }] },
    ];
    renderGrid({ rows: treeRows, columns: [{ field: 'name', headerText: 'Name' }], treeChildrenKey: 'kids' });

    await fireEvent.update(screen.getByLabelText('Search'), 'apple');

    expect(screen.getByText('Fruits')).toBeInTheDocument(); // ancestor of the match, auto-expanded
    expect(screen.getByText('Apple')).toBeInTheDocument();
    expect(screen.queryByText('Banana')).not.toBeInTheDocument(); // sibling, doesn't match
    expect(screen.queryByText('Vegetables')).not.toBeInTheDocument(); // no matching descendant
  });

  it('expands a row to show its detail content and collapses it back', async () => {
    renderGrid({ rows, columns, renderDetail: (row: Record<string, unknown>) => h('span', `Detail for ${row.name}`) });

    expect(screen.queryByText('Detail for Beatriz')).not.toBeInTheDocument();

    await fireEvent.click(screen.getAllByLabelText('Expand row details')[0]);
    expect(screen.getByText('Detail for Beatriz')).toBeInTheDocument();

    await fireEvent.click(screen.getByLabelText('Collapse row details'));
    expect(screen.queryByText('Detail for Beatriz')).not.toBeInTheDocument();
  });

  it('turns master-detail on through the #detail slot too', async () => {
    renderGrid({ rows, columns }, { detail: ({ row }: { row: Record<string, unknown> }) => h('span', `Slot detail for ${row.name}`) });

    await fireEvent.click(screen.getAllByLabelText('Expand row details')[0]);
    expect(screen.getByText('Slot detail for Beatriz')).toBeInTheDocument();
  });

  it('collapses any other expanded row when singleDetailExpand is set', async () => {
    renderGrid({
      rows,
      columns,
      renderDetail: (row: Record<string, unknown>) => h('span', `Detail for ${row.name}`),
      singleDetailExpand: true,
    });

    const toggles = screen.getAllByLabelText('Expand row details');
    await fireEvent.click(toggles[0]);
    expect(screen.getByText('Detail for Beatriz')).toBeInTheDocument();

    await fireEvent.click(screen.getAllByLabelText('Expand row details')[0]); // now Ana's row (the only one left collapsed)
    expect(screen.queryByText('Detail for Beatriz')).not.toBeInTheDocument();
    expect(screen.getByText('Detail for Ana')).toBeInTheDocument();
  });

  it('has no master-detail toggle while grouped', async () => {
    renderGrid({ rows: salesRows, columns: salesColumns, renderDetail: () => h('span', 'x') });
    await fireEvent.update(screen.getByLabelText('Group by'), 'region');

    expect(screen.queryAllByLabelText('Expand row details')).toHaveLength(0);
  });

  describe('virtualScroll', () => {
    const manyRows = Array.from({ length: 50 }, (_, i) => ({ name: `Row${i}` }));
    const nameColumn = [{ field: 'name', headerText: 'Name' }];

    it('mounts only the rows in view (plus overscan), not the full dataset', () => {
      const { container } = renderGrid({ rows: manyRows, columns: nameColumn, virtualScroll: true, height: 100, virtualRowHeight: 20, overscan: 1 });

      // height/rowHeight = 5 visible rows, +1 overscan => rows 0..5 (index 6 exclusive).
      expect(screen.getByText('Row0')).toBeInTheDocument();
      expect(screen.getByText('Row5')).toBeInTheDocument();
      expect(screen.queryByText('Row6')).not.toBeInTheDocument();
      expect(screen.queryByText('Row49')).not.toBeInTheDocument();

      // A real scrollbar-sized bottom spacer stands in for the unmounted rows.
      const viewport = container.querySelector('.inandu-grid-viewport')!;
      const bottomSpacer = viewport.querySelector('tr[aria-hidden="true"]:last-of-type td') as HTMLElement;
      expect(bottomSpacer.style.height).toBe(`${(50 - 6) * 20}px`);
    });

    it('shifts the mounted window when the viewport scrolls', async () => {
      const { container } = renderGrid({ rows: manyRows, columns: nameColumn, virtualScroll: true, height: 100, virtualRowHeight: 20, overscan: 1 });

      const viewport = container.querySelector('.inandu-grid-viewport')!;
      await fireEvent.scroll(viewport, { target: { scrollTop: 200 } });

      // floor(200/20)-1=9 .. ceil(300/20)+1=16 (exclusive) => rows 9..15.
      expect(screen.queryByText('Row0')).not.toBeInTheDocument();
      expect(screen.getByText('Row9')).toBeInTheDocument();
      expect(screen.getByText('Row15')).toBeInTheDocument();
      expect(screen.queryByText('Row16')).not.toBeInTheDocument();
    });

    it('bypasses pagination and disables the totals row, master-detail, and row drag-reorder', () => {
      renderGrid({
        rows: salesRows,
        columns: salesColumns,
        virtualScroll: true,
        pageSize: 1,
        renderDetail: () => h('span', 'detail'),
        rowReorder: true,
      });

      expect(screen.queryByText(/Page \d+ of \d+/)).not.toBeInTheDocument();
      expect(screen.queryByText(/Amount Σ/)).not.toBeInTheDocument();
      expect(screen.queryAllByLabelText('Expand row details')).toHaveLength(0);
      expect(screen.queryAllByLabelText('Drag to reorder row')).toHaveLength(0);
      // All 3 rows still present (unfiltered dataset, no virtualization-window edge case at this size).
      expect(screen.getAllByRole('row')).toHaveLength(1 + 1 + salesRows.length); // header + filter-row + data rows
    });
  });

  it('exposes the headless engine as `grid` on a template ref', () => {
    const wrapper = mount(InanduGrid, { props: { rows, columns } });
    wrapper.vm.grid.toggleSort('name');
    expect(wrapper.vm.grid.sortedRows).toEqual([rows[1], rows[0]]);
    wrapper.unmount();
  });
});

describe('InanduGrid: custom render slots', () => {
  it('renderCell replaces the formatted display value', () => {
    const columnsWithRenderCell = [columns[0], { ...columns[1], renderCell: ({ value }: { value: unknown }) => h('strong', `Age: ${value}`) }];
    renderGrid({ rows, columns: columnsWithRenderCell });
    expect(screen.getByText('Age: 41')).toBeInTheDocument();
    expect(screen.queryByText('41')).not.toBeInTheDocument();
  });

  it('renderCell receives the row and field too', () => {
    const columnsWithRenderCell = [
      { ...columns[0], renderCell: ({ row, field }: { row: Record<string, unknown>; field: string }) => h('em', `${field}=${row.name}`) },
      columns[1],
    ];
    renderGrid({ rows, columns: columnsWithRenderCell });
    expect(screen.getByText('name=Beatriz')).toBeInTheDocument();
  });

  it('a #cell-<field> slot replaces the formatted display value, and wins over renderCell', () => {
    const columnsWithRenderCell = [columns[0], { ...columns[1], renderCell: () => h('span', 'from renderCell') }];
    renderGrid({ rows, columns: columnsWithRenderCell }, { 'cell-age': ({ value }: { value: unknown }) => h('b', `Slot age ${value}`) });
    expect(screen.getByText('Slot age 41')).toBeInTheDocument();
    expect(screen.queryByText('from renderCell')).not.toBeInTheDocument();
  });

  it('renderHeader replaces the header label; sort arrow/priority/resize handle are unaffected', async () => {
    const columnsWithRenderHeader = [{ ...columns[0], renderHeader: ({ title }: { title: string }) => h('span', `★ ${title}`) }, columns[1]];
    renderGrid({ rows, columns: columnsWithRenderHeader });
    const header = screen.getByRole('columnheader', { name: 'Sort by Name' });
    expect(header).toHaveTextContent('★ Name');
    await fireEvent.click(header);
    expect(header).toHaveTextContent('★ Name ▲');
  });

  it('a #header-<field> slot replaces the header label', () => {
    renderGrid({ rows, columns }, { 'header-name': ({ title }: { title: string }) => h('span', `Slot ${title}`) });
    expect(screen.getByRole('columnheader', { name: 'Sort by Name' })).toHaveTextContent('Slot Name');
  });

  it('renderEditor replaces the built-in input while editing an existing row', async () => {
    const columnsWithRenderEditor = [
      {
        ...editableColumns[0],
        renderEditor: ({ value, setValue }: { value: unknown; setValue: (v: unknown) => void }) =>
          h('input', {
            'aria-label': 'Custom name editor',
            value: value as string,
            onInput: (e: Event) => setValue((e.target as HTMLInputElement).value),
          }),
      },
      editableColumns[1],
    ];
    const onRowSave = vi.fn();
    renderGrid({ rows, columns: columnsWithRenderEditor, onRowSave });

    await fireEvent.click(screen.getAllByText('Edit')[0]);
    expect(screen.queryByLabelText('Edit Name')).not.toBeInTheDocument();
    await fireEvent.update(screen.getByLabelText('Custom name editor'), 'Zoe');
    await fireEvent.click(screen.getByText('Save'));
    await waitFor(() => expect(screen.queryByLabelText('Custom name editor')).not.toBeInTheDocument());
    expect(onRowSave).toHaveBeenCalledWith(expect.objectContaining({ values: expect.objectContaining({ name: 'Zoe' }) }));
  });

  it('renderEditor also replaces the built-in input in the new-row draft', async () => {
    const columnsWithRenderEditor = [
      {
        ...editableColumns[0],
        renderEditor: ({ value, setValue }: { value: unknown; setValue: (v: unknown) => void }) =>
          h('input', {
            'aria-label': 'Custom name editor',
            value: (value as string) ?? '',
            onInput: (e: Event) => setValue((e.target as HTMLInputElement).value),
          }),
      },
      editableColumns[1],
    ];
    renderGrid({ rows, columns: columnsWithRenderEditor, creatable: true });
    await fireEvent.click(screen.getByText('Add row'));
    expect(screen.getByLabelText('Custom name editor')).toBeInTheDocument();
    expect(screen.queryByLabelText('Edit Name')).not.toBeInTheDocument();
  });

  it('an #editor-<field> slot replaces the built-in input', async () => {
    const onRowSave = vi.fn();
    renderGrid(
      { rows, columns: editableColumns, onRowSave },
      {
        'editor-name': ({ value, setValue }: { value: unknown; setValue: (v: unknown) => void }) =>
          h('input', { 'aria-label': 'Slot name editor', value, onInput: (e: Event) => setValue((e.target as HTMLInputElement).value) }),
      },
    );

    await fireEvent.click(screen.getAllByText('Edit')[0]);
    await fireEvent.update(screen.getByLabelText('Slot name editor'), 'Zoe');
    await fireEvent.click(screen.getByText('Save'));
    await waitFor(() => expect(onRowSave).toHaveBeenCalledWith(expect.objectContaining({ values: expect.objectContaining({ name: 'Zoe' }) })));
  });
});

describe('InanduGrid: cell range selection', () => {
  it('does not mark any cell selected without cellRangeSelection', async () => {
    const { container } = renderGrid({ rows, columns });
    await fireEvent.mouseDown(screen.getByText('Beatriz'), { button: 0 });
    expect(container.querySelector('.inandu-cell-range-selected')).not.toBeInTheDocument();
  });

  it('selects a single cell on mousedown', async () => {
    const { container } = renderGrid({ rows, columns, cellRangeSelection: true });
    await fireEvent.mouseDown(screen.getByText('Beatriz'), { button: 0 });
    const selected = container.querySelectorAll('.inandu-cell-range-selected');
    expect(selected).toHaveLength(1);
    expect(selected[0]).toHaveTextContent('Beatriz');
  });

  it('extends the rectangle across a mousedown + mouseenter drag', async () => {
    const { container } = renderGrid({ rows, columns, cellRangeSelection: true });
    await fireEvent.mouseDown(screen.getByText('Beatriz'), { button: 0 }); // row 0, col 0
    await fireEvent.mouseEnter(screen.getByText('30')); // row 1, col 1 (Ana's age)
    // The 2x2 rectangle between (0,0) and (1,1) is every cell in this 2-row/2-column grid.
    expect(container.querySelectorAll('.inandu-cell-range-selected')).toHaveLength(4);
  });

  it('reports the selected range via cell-range-change', async () => {
    const onCellRangeChange = vi.fn();
    renderGrid({ rows, columns, cellRangeSelection: true, onCellRangeChange });
    await fireEvent.mouseDown(screen.getByText('Beatriz'), { button: 0 });
    await fireEvent.mouseEnter(screen.getByText('Ana'));
    expect(onCellRangeChange).toHaveBeenLastCalledWith({ rows: [rows[0], rows[1]], fields: ['name'] });
  });

  it('reports undefined once the selection has nothing (initial render)', () => {
    const onCellRangeChange = vi.fn();
    renderGrid({ rows, columns, cellRangeSelection: true, onCellRangeChange });
    expect(onCellRangeChange).toHaveBeenCalledWith(undefined);
  });

  it('multiRange: Ctrl-drag adds a second rectangle reported via cell-ranges-change', async () => {
    const onCellRangesChange = vi.fn();
    const { container } = renderGrid({ rows, columns, cellRangeSelection: true, multiRange: true, onCellRangesChange });
    await fireEvent.mouseDown(screen.getByText('Beatriz'), { button: 0 });
    await fireEvent.mouseUp(document);
    await fireEvent.mouseDown(screen.getByText('30'), { button: 0, ctrlKey: true });

    expect(container.querySelectorAll('.inandu-cell-range-selected')).toHaveLength(2);
    expect(onCellRangesChange).toHaveBeenLastCalledWith([
      { rows: [rows[0]], fields: ['name'] },
      { rows: [rows[1]], fields: ['age'] },
    ]);
  });

  it('shift-click extends the existing anchor without a drag', async () => {
    const { container } = renderGrid({ rows, columns, cellRangeSelection: true });
    await fireEvent.mouseDown(screen.getByText('Beatriz'), { button: 0 }); // anchor: row 0, col 0
    await fireEvent.mouseUp(document); // ends the drag gesture — the anchor itself must survive this
    await fireEvent.mouseDown(screen.getByText('30'), { button: 0, shiftKey: true }); // row 1, col 1
    // Shift-click extends the original anchor (0,0) rather than resetting it to (1,1) alone.
    expect(container.querySelectorAll('.inandu-cell-range-selected')).toHaveLength(4);
  });

  it('a plain click resets the selection to the new cell', async () => {
    const { container } = renderGrid({ rows, columns, cellRangeSelection: true });
    await fireEvent.mouseDown(screen.getByText('Beatriz'), { button: 0 });
    await fireEvent.mouseEnter(screen.getByText('Ana'));
    await fireEvent.mouseUp(document);
    await fireEvent.mouseDown(screen.getByText('41'), { button: 0 });
    const selected = container.querySelectorAll('.inandu-cell-range-selected');
    expect(selected).toHaveLength(1);
    expect(selected[0]).toHaveTextContent('41');
  });

  it('hovering cells without a drag in progress does not start a selection', async () => {
    const { container } = renderGrid({ rows, columns, cellRangeSelection: true });
    await fireEvent.mouseEnter(screen.getByText('Beatriz'));
    expect(container.querySelector('.inandu-cell-range-selected')).not.toBeInTheDocument();
  });

  it('Ctrl+C copies the whole selected range as TSV when clipboard is also on', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true });
    renderGrid({ rows, columns, clipboard: true, cellRangeSelection: true });
    await fireEvent.mouseDown(screen.getByText('Beatriz'), { button: 0 });
    await fireEvent.mouseEnter(screen.getByText('30'));
    await fireEvent.keyDown(screen.getByText('Beatriz'), { key: 'c', ctrlKey: true });
    expect(writeText).toHaveBeenCalledWith('Beatriz\t41\nAna\t30');
  });

  it('Ctrl+C still copies just the focused cell when only one cell is selected', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true });
    renderGrid({ rows, columns, clipboard: true, cellRangeSelection: true });
    await fireEvent.mouseDown(screen.getByText('Beatriz'), { button: 0 });
    await fireEvent.keyDown(screen.getByText('Beatriz'), { key: 'c', ctrlKey: true });
    expect(writeText).toHaveBeenCalledWith('Beatriz');
  });

  it('is disabled while the grid is grouped', async () => {
    const { container } = renderGrid({ rows, columns, cellRangeSelection: true });
    await fireEvent.update(screen.getByLabelText('Group by'), 'name');
    // Grouped rows get `cellRangeSelection: false` in their row context, so the gesture never wires up.
    await fireEvent.mouseDown(container.querySelector('td[data-field="name"]')!, { button: 0 });
    expect(container.querySelector('.inandu-cell-range-selected')).not.toBeInTheDocument();
  });
});

import { describe, expect, it, vi } from 'vitest';
import { useInanduGrid } from './useInanduGrid';
import type { InanduGridColumn } from './useInanduGrid';

/**
 * Row editing as a state machine (review point C3): start, change, save, cancel, and what happens when an async validator is still
 * running while the user cancels, edits another row, or presses Save twice.
 */
const people = [
  { id: 1, name: 'Ada', age: 30 },
  { id: 2, name: 'Alan', age: 25 },
];

const baseColumns: InanduGridColumn[] = [
  { field: 'name', headerText: 'Name', editable: true, required: true },
  { field: 'age', headerText: 'Age', type: 'number', editable: true, min: 0, max: 120 },
];

/** A promise the test resolves by hand, to hold an async validator open. */
function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>(res => {
    resolve = res;
  });
  return { promise, resolve };
}

function setup(columns: InanduGridColumn[] = baseColumns) {
  const onRowSave = vi.fn();
  const onRowCreate = vi.fn();
  const grid = useInanduGrid({ rows: people, columns, onRowSave, onRowCreate });
  return { grid, onRowSave, onRowCreate };
}

const withAsync = (check: (value: unknown) => Promise<string | null>): InanduGridColumn[] => [{ ...baseColumns[0], asyncValidator: check }, baseColumns[1]];

describe('row editing', () => {
  it('seeds the draft from the row and reports no errors', () => {
    const { grid } = setup();
    grid.startEditingRow(people[0]);
    expect(grid.rowDraft).toEqual({ name: 'Ada', age: '30' });
    expect(grid.fieldErrors).toEqual({});
  });

  it('saves the parsed values, leaves edit mode and clears the draft', async () => {
    const { grid, onRowSave } = setup();
    grid.startEditingRow(people[0]);
    grid.setRowDraftValue('age', '31');
    await grid.saveRow(people[0]);
    expect(onRowSave).toHaveBeenCalledWith({ row: people[0], values: { name: 'Ada', age: 31 } });
    expect(grid.editingRow).toBeUndefined();
    expect(grid.rowDraft).toEqual({});
  });

  it('cancelling discards the draft and never calls onRowSave', async () => {
    const { grid, onRowSave } = setup();
    grid.startEditingRow(people[0]);
    grid.setRowDraftValue('name', 'Changed');
    grid.cancelRowEdit();
    expect(grid.editingRow).toBeUndefined();
    expect(grid.rowDraft).toEqual({});
    await grid.saveRow(people[0]);
    expect(onRowSave).not.toHaveBeenCalled();
  });

  it('a failed validation keeps the row in edit mode with the typed draft, and a later valid value saves', async () => {
    const { grid, onRowSave } = setup();
    grid.startEditingRow(people[0]);
    grid.setRowDraftValue('name', '');
    await grid.saveRow(people[0]);
    expect(onRowSave).not.toHaveBeenCalled();
    expect(grid.editingRow).toBe(people[0]);
    expect(grid.fieldErrors['name']).toBeTruthy();
    grid.setRowDraftValue('name', 'Ada L.');
    await grid.saveRow(people[0]);
    expect(onRowSave).toHaveBeenCalledTimes(1);
    expect(grid.fieldErrors).toEqual({});
  });

  it('starting another row replaces the draft: the first row is not saved', async () => {
    const { grid, onRowSave } = setup();
    grid.startEditingRow(people[0]);
    grid.setRowDraftValue('name', 'Edited Ada');
    grid.startEditingRow(people[1]);
    expect(grid.rowDraft).toEqual({ name: 'Alan', age: '25' });
    await grid.saveRow(people[0]);
    expect(onRowSave).not.toHaveBeenCalled();
  });
});

describe('row editing with an async validator', () => {
  it('reports isValidating while it runs, then saves when it passes', async () => {
    const gate = deferred<string | null>();
    const { grid, onRowSave } = setup(withAsync(() => gate.promise));
    grid.startEditingRow(people[0]);
    const saving = grid.saveRow(people[0]);
    expect(grid.isValidating).toBe(true);
    gate.resolve(null);
    await saving;
    expect(grid.isValidating).toBe(false);
    expect(onRowSave).toHaveBeenCalledTimes(1);
  });

  it('a message from the validator keeps the row in edit mode and shows under the field', async () => {
    const { grid, onRowSave } = setup(withAsync(async () => 'Name taken'));
    grid.startEditingRow(people[0]);
    await grid.saveRow(people[0]);
    expect(onRowSave).not.toHaveBeenCalled();
    expect(grid.fieldErrors['name']).toBe('Name taken');
    expect(grid.editingRow).toBe(people[0]);
  });

  it('cancelling while the validator is still running means the row is never saved', async () => {
    const gate = deferred<string | null>();
    const { grid, onRowSave } = setup(withAsync(() => gate.promise));
    grid.startEditingRow(people[0]);
    const saving = grid.saveRow(people[0]);
    grid.cancelRowEdit();
    gate.resolve(null);
    await saving;
    expect(onRowSave).not.toHaveBeenCalled();
    expect(grid.editingRow).toBeUndefined();
  });

  it('starting another row while the validator runs means the first row is never saved', async () => {
    const gate = deferred<string | null>();
    const { grid, onRowSave } = setup(withAsync(() => gate.promise));
    grid.startEditingRow(people[0]);
    const saving = grid.saveRow(people[0]);
    grid.startEditingRow(people[1]);
    gate.resolve(null);
    await saving;
    expect(onRowSave).not.toHaveBeenCalled();
    expect(grid.editingRow).toBe(people[1]);
  });

  it('cancelling and editing the SAME row again while the validator runs does not save the old attempt', async () => {
    const gate = deferred<string | null>();
    const { grid, onRowSave } = setup(withAsync(() => gate.promise));
    grid.startEditingRow(people[0]);
    const saving = grid.saveRow(people[0]);
    grid.cancelRowEdit();
    grid.startEditingRow(people[0]);
    gate.resolve(null);
    await saving;
    expect(onRowSave).not.toHaveBeenCalled();
    expect(grid.editingRow).toBe(people[0]);
  });

  it('pressing Save twice while the validator runs saves once', async () => {
    const gate = deferred<string | null>();
    const { grid, onRowSave } = setup(withAsync(() => gate.promise));
    grid.startEditingRow(people[0]);
    const first = grid.saveRow(people[0]);
    const second = grid.saveRow(people[0]);
    gate.resolve(null);
    await Promise.all([first, second]);
    expect(onRowSave).toHaveBeenCalledTimes(1);
  });

  it('a validator that throws is reported under its field and saveRow settles normally', async () => {
    const { grid, onRowSave } = setup(
      withAsync(async () => {
        throw new Error('network down');
      }),
    );
    grid.startEditingRow(people[0]);
    await expect(grid.saveRow(people[0])).resolves.toBeUndefined();
    expect(onRowSave).not.toHaveBeenCalled();
    expect(grid.isValidating).toBe(false);
    expect(grid.editingRow).toBe(people[0]);
    expect(grid.fieldErrors['name']).toContain('network down');
  });
});

describe('adding a row', () => {
  it('cancelling while the async validator runs means the row is never created', async () => {
    const gate = deferred<string | null>();
    const { grid, onRowCreate } = setup(withAsync(() => gate.promise));
    grid.startAddingRow();
    grid.setRowDraftValue('name', 'Grace');
    const saving = grid.saveNewRow();
    grid.cancelAddRow();
    gate.resolve(null);
    await saving;
    expect(onRowCreate).not.toHaveBeenCalled();
    expect(grid.isAddingRow).toBe(false);
  });

  it('creates the row with the parsed values and leaves add mode', async () => {
    const { grid, onRowCreate } = setup();
    grid.startAddingRow();
    grid.setRowDraftValue('name', 'Grace');
    grid.setRowDraftValue('age', '40');
    await grid.saveNewRow();
    expect(onRowCreate).toHaveBeenCalledWith({ name: 'Grace', age: 40 });
    expect(grid.isAddingRow).toBe(false);
  });
});

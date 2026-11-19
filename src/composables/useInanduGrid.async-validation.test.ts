import { describe, expect, it, vi } from 'vitest';
import { useInanduGrid } from './useInanduGrid';
import type { InanduGridColumn } from './useInanduGrid';

/**
 * Two decisions from the review of the editing PR: typing while an async check runs invalidates that check (the older values are not saved
 * and what was typed is kept), and the consumer decides what the user sees when the check itself fails.
 */
const person = { id: 1, name: 'Ada' };

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>(res => {
    resolve = res;
  });
  return { promise, resolve };
}

function setup(column: Partial<InanduGridColumn>) {
  const onRowSave = vi.fn();
  const columns: InanduGridColumn[] = [{ field: 'name', headerText: 'Name', editable: true, required: true, ...column }];
  const grid = useInanduGrid({ rows: [person], columns, onRowSave });
  return { grid, onRowSave };
}

describe('typing while the async check runs', () => {
  it('does not save the older values, keeps what was typed, and a second Save checks and saves the new values', async () => {
    const checked: unknown[] = [];
    const first = deferred<string | null>();
    let calls = 0;
    const { grid, onRowSave } = setup({
      asyncValidator: value => {
        checked.push(value);
        calls += 1;
        return calls === 1 ? first.promise : Promise.resolve(null);
      },
    });
    grid.startEditingRow(person);
    const saving = grid.saveRow(person);
    grid.setRowDraftValue('name', 'Ada Lovelace'); // typed while the first check is running
    first.resolve(null);
    await saving;
    expect(onRowSave).not.toHaveBeenCalled();
    expect(grid.editingRow).toBe(person); // still editing
    expect(grid.rowDraft['name']).toBe('Ada Lovelace'); // what was typed is kept
    expect(grid.isValidating).toBe(false);

    await grid.saveRow(person);
    expect(checked).toEqual(['Ada', 'Ada Lovelace']); // the second Save checked the new value
    expect(onRowSave).toHaveBeenCalledTimes(1);
    expect(onRowSave.mock.calls[0][0].values).toEqual({ name: 'Ada Lovelace' });
  });

  it('typing when no check is running changes nothing about Save', async () => {
    const { grid, onRowSave } = setup({ asyncValidator: async () => null });
    grid.startEditingRow(person);
    grid.setRowDraftValue('name', 'Grace');
    grid.setRowDraftValue('name', 'Grace H.');
    await grid.saveRow(person);
    expect(onRowSave).toHaveBeenCalledTimes(1);
    expect(onRowSave.mock.calls[0][0].values).toEqual({ name: 'Grace H.' });
  });

  it('applies to a new row too', async () => {
    const gate = deferred<string | null>();
    const onRowCreate = vi.fn();
    const columns: InanduGridColumn[] = [{ field: 'name', headerText: 'Name', editable: true, asyncValidator: () => gate.promise }];
    const grid = useInanduGrid({ rows: [person], columns, onRowCreate });
    grid.startAddingRow();
    grid.setRowDraftValue('name', 'Grace');
    const saving = grid.saveNewRow();
    grid.setRowDraftValue('name', 'Grace Hopper');
    gate.resolve(null);
    await saving;
    expect(onRowCreate).not.toHaveBeenCalled();
    expect(grid.isAddingRow).toBe(true);
    expect(grid.rowDraft['name']).toBe('Grace Hopper');
  });
});

describe('what the user sees when the async check itself fails', () => {
  const fails = (error: unknown) => async () => {
    throw error;
  };
  const save = async (column: Partial<InanduGridColumn>) => {
    const { grid } = setup(column);
    grid.startEditingRow(person);
    await grid.saveRow(person);
    return grid.fieldErrors['name'];
  };

  it('by default shows the message of an Error', async () => {
    expect(await save({ asyncValidator: fails(new Error('Name service is down')) })).toBe('Name service is down');
  });

  it('by default shows a generic text, never [object Object], when what was thrown is not an Error', async () => {
    expect(await save({ asyncValidator: fails({ status: 503 }) })).toBe('Validation could not be completed');
    expect(await save({ asyncValidator: fails(undefined) })).toBe('Validation could not be completed');
    expect(await save({ asyncValidator: fails(new Error('')) })).toBe('Validation could not be completed');
  });

  it('asyncValidatorError decides the text, and receives what was thrown', async () => {
    const seen: unknown[] = [];
    const thrown = new Error('ECONNRESET 10.0.0.12:5432 at pg.connect');
    const message = await save({
      asyncValidator: fails(thrown),
      asyncValidatorError: error => {
        seen.push(error);
        return 'We could not check this name right now. Try again.';
      },
    });
    expect(message).toBe('We could not check this name right now. Try again.');
    expect(seen).toEqual([thrown]);
    expect(message).not.toContain('10.0.0.12'); // the technical detail stays out of the interface
  });

  it('asyncValidatorError can tell failures apart', async () => {
    const column = (error: unknown): Partial<InanduGridColumn> => ({
      asyncValidator: fails(error),
      asyncValidatorError: e => ((e as { status?: number }).status === 503 ? 'Service unavailable' : 'Could not check'),
    });
    expect(await save(column({ status: 503 }))).toBe('Service unavailable');
    expect(await save(column({ status: 500 }))).toBe('Could not check');
  });

  it('falls back to the generic text when asyncValidatorError throws or returns nothing', async () => {
    expect(
      await save({
        asyncValidator: fails(new Error('x')),
        asyncValidatorError: () => {
          throw new Error('formatter bug');
        },
      }),
    ).toBe('Validation could not be completed');
    expect(await save({ asyncValidator: fails(new Error('x')), asyncValidatorError: () => '' })).toBe('Validation could not be completed');
  });

  it('is not used when the check answers with a message (that is not a failure)', async () => {
    const formatter = vi.fn(() => 'never');
    expect(await save({ asyncValidator: async () => 'Name taken', asyncValidatorError: formatter })).toBe('Name taken');
    expect(formatter).not.toHaveBeenCalled();
  });
});

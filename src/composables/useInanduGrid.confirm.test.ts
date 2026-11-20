import { afterEach, describe, expect, it, vi } from 'vitest';
import { useInanduGrid } from './useInanduGrid';
import type { InanduGridRow } from '@inandu-solutions/grid-core';

/** `confirmDelete`: a delete gated by the app's own (sync or async) answer instead of `window.confirm()`. */
const rows: InanduGridRow[] = [
  { id: 1, name: 'Ada' },
  { id: 2, name: 'Alan' },
];
const columns = [{ field: 'name', headerText: 'Name' }];

function setup(confirmDelete?: (rows: InanduGridRow[]) => boolean | Promise<boolean>, extra: Record<string, unknown> = {}) {
  const onRowDelete = vi.fn();
  const onRowsDelete = vi.fn();
  const grid = useInanduGrid({ rows, columns, selectable: true, confirmDelete, onRowDelete, onRowsDelete, ...extra });
  return { grid, onRowDelete, onRowsDelete };
}

afterEach(() => vi.restoreAllMocks());

describe('confirmDelete', () => {
  it('never calls window.confirm when it is set; a sync true deletes at once', () => {
    const confirmSpy = vi.spyOn(window, 'confirm');
    const confirmDelete = vi.fn(() => true);
    const { grid, onRowDelete } = setup(confirmDelete, { deleteConfirmMessage: 'ignored' });

    grid.deleteRow(rows[0]);

    expect(confirmDelete).toHaveBeenCalledWith([rows[0]]);
    expect(confirmSpy).not.toHaveBeenCalled();
    expect(onRowDelete).toHaveBeenCalledWith(rows[0]);
  });

  it('a sync false does not delete', () => {
    const { grid, onRowDelete } = setup(() => false);
    grid.deleteRow(rows[0]);
    expect(onRowDelete).not.toHaveBeenCalled();
  });

  it('waits for a promise and deletes only when it resolves to true', async () => {
    let resolve!: (value: boolean) => void;
    const { grid, onRowDelete } = setup(() => new Promise<boolean>(r => (resolve = r)));

    grid.deleteRow(rows[1]);
    expect(onRowDelete).not.toHaveBeenCalled();
    resolve(true);
    await Promise.resolve();
    await Promise.resolve();
    expect(onRowDelete).toHaveBeenCalledWith(rows[1]);
  });

  it('a promise that resolves to false, rejects, or a function that throws, does not delete (the last two are logged)', async () => {
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    for (const confirmDelete of [() => Promise.resolve(false), () => Promise.reject(new Error('closed')), () => { throw new Error('boom'); }]) {
      const { grid, onRowDelete } = setup(confirmDelete);
      grid.deleteRow(rows[0]);
      await new Promise(r => setTimeout(r, 0));
      expect(onRowDelete).not.toHaveBeenCalled();
    }
    expect(errorSpy).toHaveBeenCalledTimes(2);
  });

  it('a second click while the first confirmation is pending does not ask again, and asks again once it is answered', async () => {
    const answers: ((value: boolean) => void)[] = [];
    const confirmDelete = vi.fn(() => new Promise<boolean>(r => answers.push(r)));
    const { grid } = setup(confirmDelete);

    grid.deleteRow(rows[0]);
    grid.deleteRow(rows[1]);
    expect(confirmDelete).toHaveBeenCalledTimes(1);

    answers[0](false);
    await new Promise(r => setTimeout(r, 0));
    grid.deleteRow(rows[1]);
    expect(confirmDelete).toHaveBeenCalledTimes(2);
  });

  it('the bulk delete gets every selected row and clears the selection only after the confirmation', async () => {
    let resolve!: (value: boolean) => void;
    const confirmDelete = vi.fn(() => new Promise<boolean>(r => (resolve = r)));
    const { grid, onRowsDelete } = setup(confirmDelete);
    grid.toggleRowSelection(rows[0]);
    grid.toggleRowSelection(rows[1]);

    grid.deleteSelectedRows();
    expect(confirmDelete).toHaveBeenCalledWith(rows);
    expect(onRowsDelete).not.toHaveBeenCalled();
    expect(grid.selectedRows.size).toBe(2);

    resolve(true);
    await new Promise(r => setTimeout(r, 0));
    expect(onRowsDelete).toHaveBeenCalledWith(rows);
    expect(grid.selectedRows.size).toBe(0);
  });

  it('without confirmDelete the confirm messages still use window.confirm', () => {
    const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValueOnce(false).mockReturnValueOnce(true);
    const { grid, onRowDelete } = setup(undefined, { deleteConfirmMessage: 'Sure?' });

    grid.deleteRow(rows[0]);
    expect(onRowDelete).not.toHaveBeenCalled();
    grid.deleteRow(rows[0]);
    expect(confirmSpy).toHaveBeenCalledWith('Sure?');
    expect(onRowDelete).toHaveBeenCalledTimes(1);
  });
});

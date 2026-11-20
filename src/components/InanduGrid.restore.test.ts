import { fireEvent, render, screen, waitFor } from '@testing-library/vue';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createSSRApp, nextTick } from 'vue';
import { renderToString } from 'vue/server-renderer';
import InanduGrid from './InanduGrid.vue';

/**
 * Putting the saved state back (`stateKey`): the first draw already has it, a server-mode grid asks for its data once, with the
 * saved query, and what is restored is not reported as something the user did.
 */
const columns = [
  { field: 'name', headerText: 'Name' },
  { field: 'age', headerText: 'Age', type: 'number' as const },
];
const rows = [
  { name: 'Beatriz', age: 41 },
  { name: 'Ana', age: 30 },
];
const KEY = 'inandu-grid-state:restore-test';
const saved = { v: 1, sortCriteria: [{ field: 'name', direction: 'asc' }], filterQuery: 'a' };

type Props = Record<string, unknown>;
const renderGrid = (props: Props) => render(InanduGrid, { props } as never);
const nameHeader = () => screen.getByRole('columnheader', { name: 'Sort by Name' });

beforeEach(() => localStorage.setItem(KEY, JSON.stringify(saved)));
afterEach(() => {
  localStorage.removeItem(KEY);
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe('InanduGrid: restoring the saved state', () => {
  it('the very first draw already has the saved sort and search', () => {
    renderGrid({ rows, columns, stateKey: 'restore-test' });
    // No waiting: nothing has happened after the first render.
    expect(nameHeader()).toHaveAttribute('aria-sort', 'ascending');
    expect(screen.getByLabelText('Search')).toHaveValue('a');
  });

  it('does not overwrite what is saved when it mounts', async () => {
    renderGrid({ rows, columns, stateKey: 'restore-test' });
    await nextTick();
    await nextTick();
    expect(JSON.parse(localStorage.getItem(KEY)!)).toMatchObject({ sortCriteria: saved.sortCriteria, filterQuery: 'a' });
  });

  it('server mode: one query, the saved one, instead of the default one followed by the saved one', () => {
    const onQueryChange = vi.fn();
    renderGrid({ rows, columns, stateKey: 'restore-test', pageSize: 10, serverSide: { totalItems: 2 }, onQueryChange });

    expect(onQueryChange).toHaveBeenCalledTimes(1);
    expect(onQueryChange).toHaveBeenCalledWith(expect.objectContaining({ sortCriteria: saved.sortCriteria, filterQuery: 'a' }));
  });

  it('does not report the restore as sort, filter, page or selection changes', async () => {
    const onSortChange = vi.fn();
    const onFilterChange = vi.fn();
    const onPageChange = vi.fn();
    const onSelectionChange = vi.fn();
    renderGrid({ rows, columns, stateKey: 'restore-test', onSortChange, onFilterChange, onPageChange, onSelectionChange });
    await nextTick();
    await nextTick();

    expect(onSortChange).not.toHaveBeenCalled();
    expect(onFilterChange).not.toHaveBeenCalled();
    expect(onPageChange).not.toHaveBeenCalled();
    expect(onSelectionChange).not.toHaveBeenCalled();
  });

  it('a grid without saved state does not emit selectionChange on mount either', async () => {
    const onSelectionChange = vi.fn();
    renderGrid({ rows, columns, selectable: true, onSelectionChange });
    await nextTick();
    expect(onSelectionChange).not.toHaveBeenCalled();
  });

  it('initialState is used instead of storage, on the first draw, and what changes after is saved', async () => {
    localStorage.removeItem(KEY);
    const getSpy = vi.spyOn(Storage.prototype, 'getItem');
    renderGrid({ rows, columns, stateKey: 'restore-test', initialState: { sortCriteria: [{ field: 'age', direction: 'desc' }] } });

    expect(screen.getByRole('columnheader', { name: 'Sort by Age' })).toHaveAttribute('aria-sort', 'descending');
    expect(getSpy).not.toHaveBeenCalled();
    await fireEvent.click(nameHeader());
    await waitFor(() => expect(JSON.parse(localStorage.getItem(KEY)!).sortCriteria).toEqual([{ field: 'name', direction: 'asc' }]));
  });

  it('initialState is checked like storage: a part with the wrong shape is ignored', () => {
    renderGrid({ rows, columns, initialState: { sortCriteria: 'x', hiddenFields: { a: 1 } } as never });
    expect(nameHeader()).toHaveAttribute('aria-sort', 'none');
  });
});

describe('InanduGrid: a server-rendered page being hydrated', () => {
  it('draws the same markup as the server, then restores after mount without reporting it', async () => {
    const props = { rows, columns, stateKey: 'restore-test' };
    // The server has no storage: it draws the defaults.
    vi.stubGlobal('localStorage', undefined);
    const html = await renderToString(createSSRApp(InanduGrid, props));
    vi.unstubAllGlobals();
    expect(html).toContain('aria-sort="none"');

    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const onSortChange = vi.fn();
    const onFilterChange = vi.fn();
    const container = document.createElement('div');
    container.innerHTML = html;
    document.body.appendChild(container);
    const app = createSSRApp(InanduGrid, { ...props, onSortChange, onFilterChange });
    app.mount(container);

    // No hydration mismatch, and the saved state shows once the page is mounted.
    expect(warn.mock.calls.filter(call => String(call[0]).includes('Hydration'))).toEqual([]);
    await waitFor(() => expect(container.querySelector('th[aria-sort="ascending"]')).not.toBeNull());
    await nextTick();
    expect(onSortChange).not.toHaveBeenCalled();
    expect(onFilterChange).not.toHaveBeenCalled();

    app.unmount();
    container.remove();
  });
});

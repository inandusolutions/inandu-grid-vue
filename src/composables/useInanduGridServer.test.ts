import { describe, expect, it, vi } from 'vitest';
import { effectScope, nextTick } from 'vue';
import contract from './contract/server-queries.json';
import { useInanduGrid, type InanduGridServerQuery } from './useInanduGrid';
import { buildInanduGridQuery, useInanduGridServer } from './useInanduGridServer';

describe('buildInanduGridQuery: shared contract fixture', () => {
  // The same fixture is parsed by Inandu.Grid.Extensions' own tests (and used by grid-react), so a
  // change on either side that breaks the wire contract fails a test in the repo that made it.
  for (const c of contract.cases) {
    it(c.name, () => {
      expect(buildInanduGridQuery(c.query as InanduGridServerQuery).toString()).toBe(c.queryString);
    });
  }

  it('appends extra params last', () => {
    const query: InanduGridServerQuery = { page: 0, pageSize: 25, sortCriteria: [], filterValues: {}, filterQuery: '' };
    expect(buildInanduGridQuery(query, { extraParams: { tenant: 'acme' } }).toString()).toBe('page=1&pageSize=25&tenant=acme');
  });
});

const query = (page: number, filterQuery = ''): InanduGridServerQuery => ({ page, pageSize: 25, sortCriteria: [], filterValues: {}, filterQuery });
const ok = (data: unknown[], total: number) => new Response(JSON.stringify({ data, total }), { status: 200 });
const until = async (cond: () => boolean) => {
  for (let i = 0; i < 200 && !cond(); i++) await new Promise(r => setTimeout(r, 5));
  expect(cond()).toBe(true);
};
const inScope = <T>(fn: () => T) => effectScope().run(fn)!;

describe('useInanduGridServer', () => {
  it('requests with the contract query string and exposes data + total', async () => {
    const fetcher = vi.fn(async () => ok([{ id: 1 }], 41));
    const server = inScope(() => useInanduGridServer({ url: '/api/p', fetcher }));
    server.setQuery(query(2));

    await until(() => server.total.value === 41);
    expect(fetcher).toHaveBeenCalledWith('/api/p?page=3&pageSize=25', expect.objectContaining({ signal: expect.anything() }));
    expect(server.rows.value).toEqual([{ id: 1 }]);
    expect(server.loading.value).toBe(false);
  });

  it('keeps the previous page while the next one loads', async () => {
    let release!: (r: Response) => void;
    const fetcher = vi
      .fn()
      .mockResolvedValueOnce(ok([{ id: 1 }], 50))
      .mockImplementationOnce(() => new Promise<Response>(resolve => (release = resolve)));
    const server = inScope(() => useInanduGridServer({ url: '/api/p', fetcher, debounceMs: 0 }));
    server.setQuery(query(0));
    await until(() => server.rows.value.length === 1);

    server.setQuery(query(1));
    await until(() => server.loading.value);
    expect(server.rows.value).toEqual([{ id: 1 }]);
    expect(server.total.value).toBe(50);

    release(ok([{ id: 2 }], 50));
    await until(() => (server.rows.value[0] as { id: number }).id === 2);
  });

  it('ignores a late response from a superseded request', async () => {
    const abortedByLabel: Record<string, boolean> = {};
    const fetcher = vi.fn((url: string, init: RequestInit) => {
      const slow = url.includes('page=1&');
      return new Promise<Response>(resolve => {
        setTimeout(() => {
          abortedByLabel[slow ? 'old' : 'new'] = !!init.signal?.aborted;
          resolve(ok([{ from: slow ? 'old' : 'new' }], 1));
        }, slow ? 400 : 5);
      });
    });
    const server = inScope(() => useInanduGridServer({ url: '/api/p', fetcher, debounceMs: 0 }));
    server.setQuery(query(0));
    await until(() => fetcher.mock.calls.length === 1);
    server.setQuery(query(1));

    await until(() => (server.rows.value[0] as { from: string } | undefined)?.from === 'new');
    await new Promise(r => setTimeout(r, 500));
    expect(server.rows.value).toEqual([{ from: 'new' }]);
    expect(abortedByLabel.old).toBe(true);
    expect(abortedByLabel.new).toBe(false);
  });

  it('surfaces HTTP errors', async () => {
    const fetcher = vi.fn(async () => new Response('nope', { status: 500, statusText: 'Boom' }));
    const server = inScope(() => useInanduGridServer({ url: '/api/p', fetcher }));
    server.setQuery(query(0));
    await until(() => !!server.error.value);
    expect(server.error.value?.message).toContain('500');
    expect(server.loading.value).toBe(false);
  });
});

describe('useInanduGrid: serverSide', () => {
  const columns = [
    { field: 'name', headerText: 'Name' },
    { field: 'age', headerText: 'Age', type: 'number' as const },
  ];
  // Deliberately unsorted and not matching any filter: the composable must not touch it.
  const pageRows = [
    { name: 'Zed', age: 1 },
    { name: 'Ada', age: 99 },
  ];

  it('does not sort, filter or slice rows; reads page count from totalItems', () => {
    const grid = useInanduGrid({ rows: pageRows, columns, pageSize: 2, serverSide: { totalItems: 7 } });
    grid.toggleSort('name');
    grid.setFilterQuery('nomatch');

    expect(grid.visibleRows).toEqual(pageRows);
    expect(grid.pageCount).toBe(4);
    expect(grid.filteredRowCount).toBe(7);
  });

  it('emits onQueryChange on setup and when sort, search or page change', async () => {
    const onQueryChange = vi.fn();
    const grid = useInanduGrid({ rows: pageRows, columns, pageSize: 2, serverSide: { totalItems: 7 }, onQueryChange });
    expect(onQueryChange).toHaveBeenLastCalledWith({ page: 0, pageSize: 2, sortCriteria: [], filterValues: {}, filterQuery: '' });

    grid.setPage(2);
    await nextTick();
    expect(onQueryChange).toHaveBeenLastCalledWith(expect.objectContaining({ page: 2 }));
    grid.toggleSort('age');
    await nextTick();
    expect(onQueryChange).toHaveBeenLastCalledWith(expect.objectContaining({ page: 0, sortCriteria: [{ field: 'age', direction: 'asc' }] }));
    grid.setFilterQuery('ada');
    await nextTick();
    expect(onQueryChange).toHaveBeenLastCalledWith(expect.objectContaining({ filterQuery: 'ada' }));
  });

  it('does not clamp the page while totalItems is still 0 (a request in flight)', () => {
    const grid = useInanduGrid({ rows: [], columns, pageSize: 2, serverSide: { totalItems: 0 } });
    grid.setPage(3);
    expect(grid.page).toBe(3);
  });

  it('turns grouping off', () => {
    const grid = useInanduGrid({ rows: pageRows, columns, pageSize: 2, serverSide: { totalItems: 2 } });
    grid.setGroupByField('name');
    expect(grid.groups).toBeNull();
  });

  it('stays client-side when serverSide is unset', () => {
    const grid = useInanduGrid({ rows: pageRows, columns, pageSize: 1 });
    expect(grid.pageCount).toBe(2);
    expect(grid.visibleRows).toEqual([pageRows[0]]);
  });
});

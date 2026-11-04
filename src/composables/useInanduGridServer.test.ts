import { describe, expect, it, vi } from 'vitest';
import { effectScope, nextTick, ref } from 'vue';
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

  it('sends the set filter as a comma list when no value needs the repeat form', () => {
    const q = buildInanduGridQuery({ page: 0, pageSize: 25, sortCriteria: [], filterQuery: '', filterValues: { status: { values: ['Active', 'Draft'] } } });
    expect(q.get('status_in')).toBe('Active,Draft');
    expect(q.has('inEncoding')).toBe(false);
  });

  it('switches every set filter to the repeat form when one value has a comma', () => {
    const q = buildInanduGridQuery({
      page: 0,
      pageSize: 25,
      sortCriteria: [],
      filterQuery: '',
      filterValues: { name: { values: ['Smith, John'] }, status: { values: ['Active', 'Draft'] } },
    });
    expect(q.getAll('name_in')).toEqual(['Smith, John']);
    expect(q.getAll('status_in')).toEqual(['Active', 'Draft']);
    expect(q.get('inEncoding')).toBe('repeat');
  });

  it('uses the repeat form for a padded or empty value', () => {
    for (const bad of ['', ' padded ']) {
      const q = buildInanduGridQuery({ page: 0, pageSize: 25, sortCriteria: [], filterQuery: '', filterValues: { name: { values: [bad, 'Ann'] } } });
      expect(q.getAll('name_in')).toEqual([bad, 'Ann']);
      expect(q.get('inEncoding')).toBe('repeat');
    }
  });

  it('sends an empty set filter as {field}_none, even next to other filter keys', () => {
    const q = buildInanduGridQuery({ page: 0, pageSize: 25, sortCriteria: [], filterQuery: '', filterValues: { tag: { values: [], text: 'x' } } });
    expect(q.get('tag_none')).toBe('1');
    expect(q.has('tag_in')).toBe(false);
    expect(q.has('tag_contains')).toBe(false);
  });

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

describe('buildInanduGridQuery: extraParams colliding with a grid parameter', () => {
  it('still lets extraParams win, and warns once per key', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const q: InanduGridServerQuery = { page: 0, pageSize: 25, sortCriteria: [], filterValues: {}, filterQuery: '' };

    const first = buildInanduGridQuery(q, { extraParams: { pageSize: '1000' } });
    buildInanduGridQuery(q, { extraParams: { pageSize: '1000' } });

    expect(first.get('pageSize')).toBe('1000');
    expect(warn).toHaveBeenCalledTimes(1);
    expect(String(warn.mock.calls[0][0])).toContain('pageSize');
    warn.mockRestore();
  });

  it('does not warn for a key the grid does not send', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const q: InanduGridServerQuery = { page: 0, pageSize: 25, sortCriteria: [], filterValues: {}, filterQuery: '' };

    buildInanduGridQuery(q, { extraParams: { tenant: 'acme' } });

    expect(warn).not.toHaveBeenCalled();
    warn.mockRestore();
  });
});

describe('useInanduGridServer: reactive options', () => {
  it('reads a ref at request time and requests again when url or extraParams change', async () => {
    const fetcher = vi.fn(async (_url: string, _init: RequestInit) => ok([], 0));
    const options = ref({ url: '/api/a', extraParams: { tenant: 'one' }, fetcher, debounceMs: 0 });
    const server = inScope(() => useInanduGridServer(options));
    server.setQuery(query(0));
    await until(() => fetcher.mock.calls.length === 1);
    expect(fetcher.mock.calls[0][0]).toBe('/api/a?page=1&pageSize=25&tenant=one');

    options.value = { ...options.value, extraParams: { tenant: 'two' } };
    await until(() => fetcher.mock.calls.length === 2);
    expect(fetcher.mock.calls[1][0]).toBe('/api/a?page=1&pageSize=25&tenant=two');

    options.value = { ...options.value, url: '/api/b' };
    await until(() => fetcher.mock.calls.length === 3);
    expect(fetcher.mock.calls[2][0]).toBe('/api/b?page=1&pageSize=25&tenant=two');
  });

  it('accepts a getter', async () => {
    const fetcher = vi.fn(async (_url: string, _init: RequestInit) => ok([], 0));
    const tenant = ref('one');
    const server = inScope(() => useInanduGridServer(() => ({ url: '/api/p', extraParams: { tenant: tenant.value }, fetcher, debounceMs: 0 })));
    server.setQuery(query(0));
    await until(() => fetcher.mock.calls.length === 1);

    tenant.value = 'two';
    await until(() => fetcher.mock.calls.length === 2);
    expect(fetcher.mock.calls[1][0]).toContain('tenant=two');
  });

  it('does not request before there is a query, even if the options change', async () => {
    const fetcher = vi.fn(async (_url: string, _init: RequestInit) => ok([], 0));
    const options = ref({ url: '/api/a', fetcher, debounceMs: 0 });
    inScope(() => useInanduGridServer(options));

    options.value = { ...options.value, url: '/api/b' };
    await new Promise(r => setTimeout(r, 30));

    expect(fetcher).not.toHaveBeenCalled();
  });
});

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

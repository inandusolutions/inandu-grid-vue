import { describe, expect, it, vi } from 'vitest';
import { effectScope } from 'vue';
import type { InanduGridServerQuery } from './useInanduGrid';
import { useInanduGridServer } from './useInanduGridServer';

/**
 * What a server can answer that is not `{ data, total }`: it must show up as `error`, never as an empty grid. The rules of the check
 * are `parseServerResponse` of grid-core (tested there); these tests are about what the data layer does with them.
 */
const query: InanduGridServerQuery = { page: 0, pageSize: 25, sortCriteria: [], filterValues: {}, filterQuery: '' };
const json = (body: unknown) => new Response(JSON.stringify(body), { status: 200 });
const until = async (cond: () => boolean) => {
  for (let i = 0; i < 200 && !cond(); i++) await new Promise(r => setTimeout(r, 5));
  expect(cond()).toBe(true);
};
const inScope = <T>(fn: () => T) => effectScope().run(fn)!;

describe('useInanduGridServer: replies of the wrong shape', () => {
  it('sets error and keeps the rows already shown', async () => {
    const fetcher = vi
      .fn()
      .mockResolvedValueOnce(json({ data: [{ id: 1 }], total: 1 }))
      .mockResolvedValueOnce(json({ items: [{ id: 2 }], count: 1 }));
    const server = inScope(() => useInanduGridServer({ url: '/api/p', fetcher, debounceMs: 0 }));

    server.setQuery(query);
    await until(() => server.rows.value.length === 1);

    server.reload();
    await until(() => !!server.error.value);
    expect(server.error.value?.message).toContain('`data`');
    expect(server.rows.value).toEqual([{ id: 1 }]);
    expect(server.total.value).toBe(1);
    expect(server.loading.value).toBe(false);
  });

  it('mapResponse adapts another shape, and its result is checked too', async () => {
    const fetcher = vi.fn(async () => json({ items: [{ id: 5 }], count: 9 }));
    const server = inScope(() =>
      useInanduGridServer({
        url: '/api/p',
        fetcher,
        debounceMs: 0,
        mapResponse: body => {
          const b = body as { items: never[]; count: number };
          return { data: b.items, total: b.count };
        },
      }),
    );
    server.setQuery(query);
    await until(() => server.total.value === 9);
    expect(server.rows.value).toEqual([{ id: 5 }]);

    const bad = inScope(() =>
      useInanduGridServer({ url: '/api/p', fetcher, debounceMs: 0, mapResponse: () => ({ data: 'nope' as never }) }),
    );
    bad.setQuery(query);
    await until(() => !!bad.error.value);
    expect(bad.error.value?.message).toContain('`data`');
  });

  it('an error thrown by mapResponse is shown as error', async () => {
    const fetcher = vi.fn(async () => json({ data: [], total: 0 }));
    const server = inScope(() =>
      useInanduGridServer({
        url: '/api/p',
        fetcher,
        debounceMs: 0,
        mapResponse: () => {
          throw new Error('cannot map');
        },
      }),
    );
    server.setQuery(query);
    await until(() => !!server.error.value);
    expect(server.error.value?.message).toBe('cannot map');
  });
});

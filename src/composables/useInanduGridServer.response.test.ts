import { describe, expect, it, vi } from 'vitest';
import { effectScope } from 'vue';
import type { InanduGridServerQuery } from './useInanduGrid';
import { parseServerResponse, useInanduGridServer } from './useInanduGridServer';

/** What a server can answer that is not `{ data, total }`: it must show up as `error`, never as an empty grid. */
const query: InanduGridServerQuery = { page: 0, pageSize: 25, sortCriteria: [], filterValues: {}, filterQuery: '' };
const json = (body: unknown) => new Response(JSON.stringify(body), { status: 200 });
const until = async (cond: () => boolean) => {
  for (let i = 0; i < 200 && !cond(); i++) await new Promise(r => setTimeout(r, 5));
  expect(cond()).toBe(true);
};
const inScope = <T>(fn: () => T) => effectScope().run(fn)!;

describe('parseServerResponse', () => {
  it('accepts { data, total }', () => {
    expect(parseServerResponse({ data: [{ id: 1 }], total: 7 })).toEqual({ data: [{ id: 1 }], total: 7 });
    expect(parseServerResponse({ data: [], total: 0 })).toEqual({ data: [], total: 0 });
  });

  it('takes a missing total to be the number of rows received', () => {
    expect(parseServerResponse({ data: [{ id: 1 }, { id: 2 }] })).toEqual({ data: [{ id: 1 }, { id: 2 }], total: 2 });
    expect(parseServerResponse({ data: [{ id: 1 }], total: null })).toEqual({ data: [{ id: 1 }], total: 1 });
  });

  it('throws with a message that says what was wrong', () => {
    expect(() => parseServerResponse(null)).toThrowError(/got null/);
    expect(() => parseServerResponse([1, 2])).toThrowError(/got an array/);
    expect(() => parseServerResponse('x')).toThrowError(/got string/);
    expect(() => parseServerResponse({})).toThrowError(/`data` to be an array, got nothing/);
    expect(() => parseServerResponse({ data: { a: 1 } })).toThrowError(/`data` to be an array, got object/);
    expect(() => parseServerResponse({ data: [], total: '5' })).toThrowError(/`total`/);
    expect(() => parseServerResponse({ data: [], total: -1 })).toThrowError(/`total`/);
    expect(() => parseServerResponse({ data: [], total: Infinity })).toThrowError(/`total`/);
  });
});

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

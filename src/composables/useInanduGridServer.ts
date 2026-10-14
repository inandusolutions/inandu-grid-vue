import { onScopeDispose, shallowRef, watch, type ShallowRef } from 'vue';
import { hasMeaningfulFilterValue } from '../core';
import type { InanduGridRow } from '../core';
import type { InanduGridServerQuery } from './useInanduGrid';

export interface InanduGridQueryOptions {
  /** Extra params appended after the grid's own (a tenant id, a fixed filter, ...). */
  extraParams?: Record<string, string>;
}

/**
 * Turns the grid's request state into the query string `Inandu.Grid.Extensions` (the .NET package)
 * parses — the contract is documented at
 * https://github.com/inandusolutions/inandu-grid-extensions/blob/main/docs/request-contract.md.
 *
 * Param order is deterministic (page, pageSize, sort, q, then column filters in field order) so the
 * result can be compared as a plain string.
 */
export function buildInanduGridQuery(query: InanduGridServerQuery, options: InanduGridQueryOptions = {}): URLSearchParams {
  const params = new URLSearchParams();
  params.set('page', String(query.page + 1)); // the composable is 0-based, the contract is 1-based
  if (query.pageSize > 0) params.set('pageSize', String(query.pageSize));

  if (query.sortCriteria.length > 0) {
    params.set('sort', query.sortCriteria.map(c => (c.direction === 'desc' ? '-' : '') + c.field).join(','));
  }

  const search = query.filterQuery.trim();
  if (search) params.set('q', search);

  for (const [field, value] of Object.entries(query.filterValues)) {
    if (!hasMeaningfulFilterValue(value)) continue;
    // A set filter ("values") takes over the column, same as the .NET side.
    if (value.values && value.values.length > 0) {
      params.set(`${field}_in`, value.values.join(','));
      continue;
    }
    if (value.text) params.set(`${field}_contains`, value.text);
    if (value.min) params.set(`${field}_gte`, value.min);
    if (value.max) params.set(`${field}_lte`, value.max);
    if (value.from) params.set(`${field}_gte`, value.from);
    if (value.to) params.set(`${field}_lte`, value.to);
    if (value.bool === 'true' || value.bool === 'false') params.set(`${field}_eq`, value.bool);
  }

  for (const [key, val] of Object.entries(options.extraParams ?? {})) params.set(key, val);
  return params;
}

export interface InanduGridServerOptions extends InanduGridQueryOptions {
  /** The endpoint, e.g. `/api/products`. The grid's params are appended as a query string. */
  url: string;
  /** Passed to `fetch` (auth headers, `credentials`, ...). */
  init?: RequestInit;
  /** Replaces `fetch` — handy for tests or a typed API client. Must honour `signal`. */
  fetcher?: (url: string, init: RequestInit) => Promise<Response>;
  /** Wait this long after the last change before requesting (typing in the search box). The first request is never delayed. Default: 200. */
  debounceMs?: number;
}

export interface InanduGridServerResult {
  /** The current page. The previous page stays here while the next one loads, so the table doesn't flash empty. */
  rows: ShallowRef<InanduGridRow[]>;
  /** Total rows matching the filters, across all pages. Also kept during a reload. */
  total: ShallowRef<number>;
  loading: ShallowRef<boolean>;
  error: ShallowRef<Error | undefined>;
  /** Wire this to `<InanduGrid @query-change>` / `useInanduGrid`'s `onQueryChange`. */
  setQuery: (query: InanduGridServerQuery) => void;
  /** Re-issues the last request (after an edit, say). */
  reload: () => void;
}

/**
 * Data layer for `serverSide` mode. Pair it with the grid:
 *
 * ```vue
 * <script setup>
 * const server = useInanduGridServer({ url: '/api/products' });
 * </script>
 * <InanduGrid :rows="server.rows.value" :columns="columns" :page-size="25"
 *   :server-side="{ totalItems: server.total.value }" @query-change="server.setQuery" />
 * ```
 *
 * Expects the `Inandu.Grid.Extensions` response shape, `{ data: [...], total: n }`. A request that
 * is superseded by a newer one is aborted, and a late response from it is ignored.
 */
export function useInanduGridServer(options: InanduGridServerOptions): InanduGridServerResult {
  const query = shallowRef<InanduGridServerQuery | undefined>(undefined);
  const rows = shallowRef<InanduGridRow[]>([]);
  const total = shallowRef(0);
  const loading = shallowRef(false);
  const error = shallowRef<Error | undefined>(undefined);
  const reloadToken = shallowRef(0);

  let firstRequestDone = false;
  let cancel: (() => void) | undefined;

  function schedule(q: InanduGridServerQuery): void {
    cancel?.();
    const controller = new AbortController();

    const run = async () => {
      setLoading(true);
      error.value = undefined;
      try {
        const qs = buildInanduGridQuery(q, { extraParams: options.extraParams }).toString();
        const target = options.url + (options.url.includes('?') ? '&' : '?') + qs;
        const requestInit: RequestInit = { ...options.init, signal: controller.signal };
        const response = await (options.fetcher ?? fetch)(target, requestInit);
        if (!response.ok) throw new Error(`Request failed: ${response.status} ${response.statusText}`);
        const body = (await response.json()) as { data?: InanduGridRow[]; total?: number };
        if (controller.signal.aborted) return;
        rows.value = body.data ?? [];
        total.value = body.total ?? 0;
      } catch (e) {
        if (controller.signal.aborted) return;
        error.value = e instanceof Error ? e : new Error(String(e));
      } finally {
        if (!controller.signal.aborted) setLoading(false);
      }
    };

    function setLoading(value: boolean) {
      loading.value = value;
    }

    const delay = firstRequestDone ? (options.debounceMs ?? 200) : 0;
    firstRequestDone = true;
    const timer = setTimeout(run, delay);
    cancel = () => {
      clearTimeout(timer);
      controller.abort();
    };
  }

  watch([query, reloadToken], () => {
    if (query.value) schedule(query.value);
  });
  onScopeDispose(() => cancel?.(), true);

  return {
    rows,
    total,
    loading,
    error,
    setQuery: next => {
      query.value = next;
    },
    reload: () => {
      reloadToken.value += 1;
    },
  };
}

import { fireEvent, render } from '@testing-library/vue';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import InanduGrid from './InanduGrid.vue';
import type { InanduGridRow } from '@inandu-solutions/grid-core';

/**
 * Where focus goes on a virtual grid when the window moves under it (review of the C PR): a keyboard jump that cannot finish must not take
 * focus away later, and a parked focus returns to the same *record*, not to the same position.
 */
const columns = [
  { field: 'id', headerText: 'ID', type: 'number' as const },
  { field: 'name', headerText: 'Name' },
];
const make = (n: number): InanduGridRow[] => Array.from({ length: n }, (_, i) => ({ id: i + 1, name: `Person ${i + 1}` }));

const props = (rows: InanduGridRow[], extra: Record<string, unknown> = {}) => ({
  rows,
  columns,
  virtualScroll: true,
  virtualRowHeight: 20,
  height: 200,
  overscan: 2,
  ...extra,
});
const viewportOf = (c: Element) => c.querySelector('.inandu-grid-viewport') as HTMLElement;
const cellOf = (c: Element, rowIndex: number, col = 1) =>
  c.querySelectorAll<HTMLElement>(`tbody tr[data-row-index="${rowIndex}"] td[role="gridcell"]`)[col];
const focusCell = (c: Element, rowIndex: number, col = 1) => {
  const cell = cellOf(c, rowIndex, col);
  cell.tabIndex = 0;
  cell.focus();
  return cell;
};
const scrollTo = (c: Element, top: number) => fireEvent.scroll(viewportOf(c), { target: { scrollTop: top } });

/** A container that is not laid out (display: none, a hidden tab) ignores writes to scrollTop, so a keyboard jump cannot finish. */
function makeUnscrollable(viewport: HTMLElement) {
  let top = 0;
  Object.defineProperty(viewport, 'scrollTop', { get: () => top, set: () => undefined, configurable: true });
  return async (value: number) => {
    top = value;
    await fireEvent.scroll(viewport);
  };
}

let input: HTMLInputElement;
beforeEach(() => {
  input = document.createElement('input');
  input.setAttribute('aria-label', 'elsewhere');
  document.body.appendChild(input);
});
afterEach(() => {
  input.remove();
  vi.restoreAllMocks();
});

describe('a keyboard jump that has to wait for its row', () => {
  it('never takes focus away from another field when the row finally appears', async () => {
    const { container } = render(InanduGrid, { props: props(make(500)) });
    const scrollUnscrollable = makeUnscrollable(viewportOf(container));
    await fireEvent.keyDown(focusCell(container, 0), { key: 'End', ctrlKey: true }); // wants row 499, which cannot be reached
    input.focus();
    await scrollUnscrollable(20 * 495); // the target row is now in the window
    expect(document.activeElement).toBe(input);
  });

  it('is forgotten when the rows change in the meantime (a filter, new data)', async () => {
    const { container, rerender } = render(InanduGrid, { props: props(make(500)) });
    const scrollUnscrollable = makeUnscrollable(viewportOf(container));
    await fireEvent.keyDown(focusCell(container, 0), { key: 'End', ctrlKey: true });
    await rerender(props(make(500))); // same size, new rows: row 499 is no longer "the" row that was asked for
    await scrollUnscrollable(20 * 495);
    expect(document.activeElement?.textContent).not.toBe('Person 500');
  });

  it('is forgotten when it has waited too long', async () => {
    const now = vi.spyOn(Date, 'now');
    now.mockReturnValue(1_000_000);
    const { container } = render(InanduGrid, { props: props(make(500)) });
    const scrollUnscrollable = makeUnscrollable(viewportOf(container));
    await fireEvent.keyDown(focusCell(container, 0), { key: 'End', ctrlKey: true });
    now.mockReturnValue(1_000_000 + 2000);
    await scrollUnscrollable(20 * 495);
    expect(document.activeElement?.textContent).not.toBe('Person 500');
  });

  it('still lands when the row arrives promptly (the normal case)', async () => {
    const { container } = render(InanduGrid, { props: props(make(500)) });
    await fireEvent.keyDown(focusCell(container, 0), { key: 'End', ctrlKey: true });
    expect(document.activeElement?.textContent).toBe('Person 500');
  });
});

describe('focus parked on the viewport while its row is out of the window', () => {
  const park = async (c: Element) => {
    focusCell(c, 2); // "Person 3"
    await scrollTo(c, 20 * 80); // its row unmounts: focus waits on the viewport
    expect(document.activeElement).toBe(viewportOf(c));
  };

  it('returns to the same record after the data was re-ordered, not to the same position', async () => {
    const rows = make(100);
    const { container, rerender } = render(InanduGrid, { props: props(rows) });
    await park(container);
    await rerender(props([...rows].reverse())); // Person 3 is now at position 97
    await scrollTo(container, 20 * 95);
    expect(document.activeElement?.textContent).toBe('Person 3');
  });

  it('returns to the same record after a sort that moved it', async () => {
    const rows = make(100);
    const { container, rerender } = render(InanduGrid, { props: props(rows) });
    await park(container);
    const sorted = [...rows].sort((a, b) => String(a['name']).localeCompare(String(b['name'])));
    await rerender(props(sorted));
    const position = sorted.findIndex(r => r['id'] === 3); // sorted as text, "Person 3" moves from position 2 to about 23
    expect(position).toBeGreaterThan(10);
    await scrollTo(container, 20 * (position - 3));
    expect(document.activeElement?.textContent).toBe('Person 3');
  });

  it('gives focus to nobody when that record is gone, and keeps it on the viewport', async () => {
    const rows = make(100);
    const { container, rerender } = render(InanduGrid, { props: props(rows) });
    await park(container);
    await rerender(props(rows.filter(r => r['id'] !== 3)));
    await scrollTo(container, 0);
    expect(document.activeElement).toBe(viewportOf(container));
  });

  it('is forgotten when the user moves focus somewhere else', async () => {
    const { container } = render(InanduGrid, { props: props(make(100)) });
    await park(container);
    input.focus();
    await scrollTo(container, 0);
    expect(document.activeElement).toBe(input);
  });

  it('follows a row identified by rowId when the objects are replaced by fresh ones with the same ids', async () => {
    const { container, rerender } = render(InanduGrid, { props: props(make(100), { rowId: 'id' }) });
    await park(container);
    await rerender(props(make(100), { rowId: 'id' })); // an API refresh: new objects, same ids
    await scrollTo(container, 0);
    expect(document.activeElement?.textContent).toBe('Person 3');
  });

  it('with no id at all, fresh objects are different records: focus is not handed to a look-alike', async () => {
    const noId = (n: number): InanduGridRow[] => Array.from({ length: n }, (_, i) => ({ name: `Person ${i + 1}` }));
    const cols = [{ field: 'name', headerText: 'Name' }];
    const view = (rows: InanduGridRow[]) => ({ rows, columns: cols, virtualScroll: true, virtualRowHeight: 20, height: 200, overscan: 2 });
    const { container, rerender } = render(InanduGrid, { props: view(noId(100)) });
    focusCell(container, 2, 0);
    await scrollTo(container, 20 * 80);
    expect(document.activeElement).toBe(viewportOf(container));
    await rerender(view(noId(100)));
    await scrollTo(container, 0);
    expect(document.activeElement).toBe(viewportOf(container));
  });
});

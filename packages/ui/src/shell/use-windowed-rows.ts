// SPDX-License-Identifier: Apache-2.0

import { defaultRangeExtractor, useVirtualizer } from "@tanstack/react-virtual";
import { useCallback, useSyncExternalStore, type CSSProperties, type RefObject } from "react";

/** Options for {@link useWindowedRows}. */
export interface WindowedRowsOptions {
  /** How many rows (groups) there are. */
  count: number;
  /** The element that scrolls, such as the bucket pane. */
  scrollRef: RefObject<HTMLElement | null>;
  /** The element that holds the rows; its position inside the scroller is measured. */
  listRef: RefObject<HTMLElement | null>;
  /** A guess at a row's height before it has been measured. */
  estimate: (index: number) => number;
  /** Rows that must stay on screen even when scrolled away: the one being edited or dragged. */
  keep: readonly number[];
  /** How many rows beyond the edges to draw, so quick scrolling doesn't show blanks. */
  overscan?: number;
}

/** What {@link useWindowedRows} gives the list. */
export interface WindowedRows {
  /** Whether rows are being left out. `false` when there is no layout to measure (tests, hidden panes). */
  windowed: boolean;
  /** The rows to draw, in order, each with the style that places it. */
  rows: { index: number; style: CSSProperties }[];
  /** Style for the box that holds the rows: tall enough for all of them. */
  containerStyle: CSSProperties;
  /** Set as `ref` on each drawn row (with `data-index`) so its real height is measured. */
  measureRef: (element: Element | null) => void;
  /** Scrolls so that a row is on screen. */
  scrollToIndex: (index: number) => void;
}

/** Where the list sits and how big the window is, as one comparable value. */
function readGeometry(scroll: HTMLElement | null, list: HTMLElement | null): string {
  if (scroll === null || list === null) return "0|0";
  const margin =
    list.getBoundingClientRect().top - scroll.getBoundingClientRect().top + scroll.scrollTop;
  return `${String(scroll.clientHeight)}|${String(Math.round(margin))}`;
}

/**
 * Draws only the rows that are on screen (plus a few either side) of a long list that sits
 * inside a scrolling page, so a bucket with hundreds of items doesn't re-draw them all on every
 * change. Rows can differ in height (an item and its steps); each is measured once drawn.
 *
 * Where there is nothing to measure (jsdom, or a hidden pane) it draws every row, so small
 * lists and tests behave exactly as before.
 *
 * @param options - See {@link WindowedRowsOptions}.
 * @returns What to draw and how to place it.
 */
export function useWindowedRows({
  count,
  scrollRef,
  listRef,
  estimate,
  keep,
  overscan = 8,
}: WindowedRowsOptions): WindowedRows {
  // The scroller's height, and where the list starts inside it, change when the window is
  // resized or when something above the list grows (a card in hand): watch both.
  const subscribe = useCallback(
    (onChange: () => void) => {
      const scroll = scrollRef.current;
      if (scroll === null || typeof ResizeObserver === "undefined") return () => undefined;
      const observer = new ResizeObserver(onChange);
      observer.observe(scroll);
      for (const child of scroll.children) observer.observe(child);
      return () => {
        observer.disconnect();
      };
    },
    [scrollRef],
  );
  const geometry = useSyncExternalStore(subscribe, () =>
    readGeometry(scrollRef.current, listRef.current),
  );
  const [viewport = "0", margin = "0"] = geometry.split("|");
  const windowed = Number(viewport) > 0;

  const virtualizer = useVirtualizer({
    count,
    getScrollElement: () => scrollRef.current,
    estimateSize: estimate,
    scrollMargin: Number(margin),
    overscan,
    measureElement: (element, entry) => {
      const measured = entry?.borderBoxSize[0]?.blockSize ?? element.getBoundingClientRect().height;
      return measured > 0 ? measured : estimate(Number(element.getAttribute("data-index")));
    },
    rangeExtractor: (range) =>
      [
        ...new Set([...defaultRangeExtractor(range), ...keep.filter((i) => i >= 0 && i < count)]),
      ].sort((a, b) => a - b),
  });

  if (!windowed) {
    return {
      windowed,
      rows: Array.from({ length: count }, (_, index) => ({ index, style: {} })),
      containerStyle: {},
      measureRef: () => undefined,
      scrollToIndex: () => undefined,
    };
  }
  const offset = Number(margin);
  const byIndex = new Map(virtualizer.getVirtualItems().map((item) => [item.index, item]));
  return {
    windowed,
    rows: [...byIndex.values()].map((item) => ({
      index: item.index,
      style: {
        position: "absolute",
        top: 0,
        left: 0,
        width: "100%",
        transform: `translateY(${String(item.start - offset)}px)`,
      },
    })),
    containerStyle: { position: "relative", height: virtualizer.getTotalSize() },
    measureRef: virtualizer.measureElement,
    scrollToIndex: (index) => {
      virtualizer.scrollToIndex(index, { align: "auto" });
    },
  };
}

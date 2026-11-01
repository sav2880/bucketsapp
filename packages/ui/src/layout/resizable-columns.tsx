// SPDX-License-Identifier: Apache-2.0

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type KeyboardEvent,
  type PointerEvent,
  type ReactElement,
  type ReactNode,
} from "react";
import { t } from "../i18n";
import { fitToAvailable, gridTemplate, resizeColumn, type ColumnSpec } from "./columns";

/** Pixels moved by one arrow-key press on a column edge. */
const KEY_STEP = 12;

/** Props for {@link ResizableColumns}. */
export interface ResizableColumnsProps {
  /** The columns, left to right. */
  columns: readonly ColumnSpec[];
  /** Saved widths by column id; a missing id uses the column's default. */
  widths?: Readonly<Record<string, number>> | undefined;
  /** Called with the full set of widths whenever the user changes one. */
  onWidthsChange?: ((widths: Record<string, number>) => void) | undefined;
  /**
   * Measures how wide a column's content wants to be, for the double-click auto-fit. When
   * missing, double-click goes back to the default width.
   */
  measure?: ((columnId: string) => number) | undefined;
  /**
   * How many rows the table has in all, header included, when only some are drawn (a long list
   * that shows just the rows on screen). Lets screen readers announce "row 40 of 500".
   */
  rowCount?: number | undefined;
  /** Rows. They line up with the header by using `grid-template-columns: var(--columns)`. */
  children: ReactNode;
}

/**
 * A header row with draggable column edges, and a place for rows that share its columns.
 *
 * Drag an edge, or focus it and use the arrow keys; double-click (or press Enter) to fit the
 * column to its content. When the window gets narrower the columns shrink together instead
 * of overflowing.
 *
 * @param props - See {@link ResizableColumnsProps}.
 * @returns The header and rows.
 */
export function ResizableColumns({
  columns,
  widths,
  onWidthsChange,
  measure,
  rowCount,
  children,
}: ResizableColumnsProps): ReactElement {
  const root = useRef<HTMLDivElement>(null);
  const [available, setAvailable] = useState(Number.POSITIVE_INFINITY);

  useEffect(() => {
    const element = root.current;
    if (element === null || typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(([entry]) => {
      if (entry) setAvailable(entry.contentRect.width);
    });
    observer.observe(element);
    return () => {
      observer.disconnect();
    };
  }, []);

  const wanted = useMemo(
    () => columns.map((c) => widths?.[c.id] ?? c.defaultWidth),
    [columns, widths],
  );
  const shown = useMemo(() => {
    // The flexible column keeps at least its minimum, so the fixed ones share what is left.
    const flexibleMin = columns.reduce((sum, c) => sum + (c.flexible ? c.minWidth : 0), 0);
    const fixedSpecs = columns.map((c) => (c.flexible ? { ...c, minWidth: 0 } : c));
    const fixedWanted = wanted.map((w, i) => (columns[i]?.flexible ? 0 : w));
    return fitToAvailable(fixedSpecs, fixedWanted, available - flexibleMin);
  }, [columns, wanted, available]);

  // The flexible column has no pixel width of its own; when saving, keep what it had.
  const current = useMemo(
    () => shown.map((w, i) => (columns[i]?.flexible ? (wanted[i] ?? w) : w)),
    [columns, shown, wanted],
  );

  const commit = useCallback(
    (next: readonly number[]) => {
      onWidthsChange?.(
        Object.fromEntries(columns.map((c, i) => [c.id, next[i] ?? c.defaultWidth])),
      );
    },
    [columns, onWidthsChange],
  );

  const fit = (index: number): void => {
    const spec = columns[index];
    if (!spec) return;
    const target = measure ? measure(spec.id) : spec.defaultWidth;
    commit(resizeColumn(columns, current, index, target - (current[index] ?? 0)));
  };

  const drag = useRef<{ index: number; startX: number; startWidth: number } | undefined>(undefined);
  const onPointerDown = (index: number) => (event: PointerEvent<HTMLDivElement>) => {
    drag.current = { index, startX: event.clientX, startWidth: current[index] ?? 0 };
    event.currentTarget.setPointerCapture(event.pointerId);
  };
  const onPointerMove = (event: PointerEvent<HTMLDivElement>) => {
    const d = drag.current;
    if (d === undefined) return;
    commit(
      resizeColumn(
        columns,
        current,
        d.index,
        d.startWidth + event.clientX - d.startX - (current[d.index] ?? 0),
      ),
    );
  };
  const onPointerUp = () => {
    drag.current = undefined;
  };
  const onKeyDown = (index: number) => (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key === "ArrowLeft") commit(resizeColumn(columns, current, index, -KEY_STEP));
    else if (event.key === "ArrowRight") commit(resizeColumn(columns, current, index, KEY_STEP));
    else if (event.key === "Enter") fit(index);
    else return;
    event.preventDefault();
  };

  const style = { "--columns": gridTemplate(columns, shown) } as CSSProperties;
  const rowStyle: CSSProperties = { display: "grid", gridTemplateColumns: "var(--columns)" };
  const headStyle: CSSProperties = { position: "relative", padding: "0 var(--space-2)" };
  const handleStyle: CSSProperties = {
    position: "absolute",
    top: 0,
    right: -4,
    width: 9,
    height: "100%",
    cursor: "col-resize",
    touchAction: "none",
    zIndex: 1,
  };

  return (
    <div ref={root} style={style} role="table" aria-rowcount={rowCount} data-testid="columns">
      <div role="row" aria-rowindex={rowCount === undefined ? undefined : 1} style={rowStyle}>
        {columns.map((spec, i) => (
          <div key={spec.id} role="columnheader" style={headStyle}>
            {spec.label}
            {i < columns.length - 1 && (
              <div
                role="slider"
                aria-orientation="horizontal"
                aria-label={t("columns.resize", { name: spec.label })}
                aria-valuenow={shown[i] ?? spec.defaultWidth}
                aria-valuemin={spec.minWidth}
                {...(spec.maxWidth === undefined ? {} : { "aria-valuemax": spec.maxWidth })}
                tabIndex={0}
                data-testid={`column-edge-${spec.id}`}
                style={handleStyle}
                onPointerDown={onPointerDown(i)}
                onPointerMove={onPointerMove}
                onPointerUp={onPointerUp}
                onPointerCancel={onPointerUp}
                onDoubleClick={() => {
                  fit(i);
                }}
                onKeyDown={onKeyDown(i)}
              />
            )}
          </div>
        ))}
      </div>
      {children}
    </div>
  );
}

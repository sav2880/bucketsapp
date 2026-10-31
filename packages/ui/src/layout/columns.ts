// SPDX-License-Identifier: Apache-2.0

/** One column of a {@link ResizableColumns} header. */
export interface ColumnSpec {
  /** Stable id; keys the saved width. */
  id: string;
  /** Shown in the header. */
  label: string;
  /** Width in pixels until the user changes it. */
  defaultWidth: number;
  /** Narrowest the column may be, in pixels. */
  minWidth: number;
  /** Widest the column may be, in pixels. */
  maxWidth?: number;
  /** Takes whatever space the other columns leave. At most one column per header. */
  flexible?: boolean;
}

/**
 * Keeps a width within the column's limits.
 *
 * @param spec - The column.
 * @param width - Wanted width in pixels.
 * @returns A whole number of pixels between the limits.
 */
export function clampWidth(spec: ColumnSpec, width: number): number {
  const max = spec.maxWidth ?? Number.POSITIVE_INFINITY;
  return Math.round(Math.min(max, Math.max(spec.minWidth, width)));
}

/**
 * Changes one column's width by dragging or arrow keys.
 *
 * @param specs - The columns.
 * @param widths - Current widths, one per column.
 * @param index - Which column.
 * @param delta - Pixels to add; negative to shrink.
 * @returns New widths; the other columns are untouched.
 */
export function resizeColumn(
  specs: readonly ColumnSpec[],
  widths: readonly number[],
  index: number,
  delta: number,
): number[] {
  return widths.map((w, i) => {
    const spec = specs[i];
    return i === index && spec ? clampWidth(spec, w + delta) : w;
  });
}

/**
 * Shrinks the columns in proportion when they no longer fit, so none disappears and none
 * goes below its minimum. Never grows them back: that is the user's choice.
 *
 * @param specs - The columns.
 * @param widths - Wanted widths, one per column.
 * @param available - Pixels the columns may use together.
 * @returns Widths whose total fits `available`, or sits at the minimums if even that is too wide.
 */
export function fitToAvailable(
  specs: readonly ColumnSpec[],
  widths: readonly number[],
  available: number,
): number[] {
  const total = widths.reduce((a, b) => a + b, 0);
  if (total <= available) return [...widths];
  const room = widths.map((w, i) => Math.max(0, w - (specs[i]?.minWidth ?? 0)));
  const shrinkable = room.reduce((a, b) => a + b, 0);
  const excess = total - available;
  if (shrinkable <= excess) return widths.map((w, i) => w - (room[i] ?? 0));
  return widths.map((w, i) => Math.round(w - (excess * (room[i] ?? 0)) / shrinkable));
}

/**
 * The CSS grid template that rows share with the header.
 *
 * @param specs - The columns.
 * @param widths - Widths to use, one per column.
 * @returns For example `"minmax(160px, 1fr) 90px 80px"`.
 */
export function gridTemplate(specs: readonly ColumnSpec[], widths: readonly number[]): string {
  return specs
    .map((spec, i) =>
      spec.flexible
        ? `minmax(${String(spec.minWidth)}px, 1fr)`
        : `${String(widths[i] ?? spec.defaultWidth)}px`,
    )
    .join(" ");
}

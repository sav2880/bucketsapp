// SPDX-License-Identifier: Apache-2.0

import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { clampWidth, fitToAvailable, gridTemplate, resizeColumn, type ColumnSpec } from "./columns";

const specs: ColumnSpec[] = [
  { id: "name", label: "Name", defaultWidth: 200, minWidth: 100, flexible: true },
  { id: "status", label: "Status", defaultWidth: 100, minWidth: 60, maxWidth: 200 },
  { id: "added", label: "Added", defaultWidth: 100, minWidth: 40 },
];

describe("clampWidth", () => {
  it("keeps widths within limits and whole", () => {
    expect(clampWidth(specs[1] as ColumnSpec, 10)).toBe(60);
    expect(clampWidth(specs[1] as ColumnSpec, 999)).toBe(200);
    expect(clampWidth(specs[2] as ColumnSpec, 999)).toBe(999);
    expect(clampWidth(specs[1] as ColumnSpec, 80.6)).toBe(81);
  });
});

describe("resizeColumn", () => {
  it("changes only the chosen column, within its limits", () => {
    expect(resizeColumn(specs, [200, 100, 100], 1, 50)).toEqual([200, 150, 100]);
    expect(resizeColumn(specs, [200, 100, 100], 1, 500)).toEqual([200, 200, 100]);
    expect(resizeColumn(specs, [200, 100, 100], 2, -500)).toEqual([200, 100, 40]);
  });
});

describe("fitToAvailable", () => {
  it("leaves widths alone when they fit", () => {
    expect(fitToAvailable(specs, [0, 100, 100], 500)).toEqual([0, 100, 100]);
  });

  it("shrinks in proportion to the room above each minimum", () => {
    // Room: 40 and 60 (total 100); 50 too wide, so each gives half of its room... 20 and 30.
    expect(fitToAvailable(specs, [0, 100, 100], 150)).toEqual([0, 80, 70]);
  });

  it("stops at the minimums when even that doesn't fit", () => {
    expect(fitToAvailable(specs, [0, 100, 100], 10)).toEqual([0, 60, 40]);
  });

  it("never exceeds the room, never goes below a minimum, never grows", () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 60, max: 200 }),
        fc.integer({ min: 40, max: 400 }),
        fc.integer({ min: 0, max: 700 }),
        (a, b, available) => {
          const result = fitToAvailable(specs.slice(1), [a, b], available);
          const [x = 0, y = 0] = result;
          expect(x).toBeGreaterThanOrEqual(60);
          expect(y).toBeGreaterThanOrEqual(40);
          expect(x).toBeLessThanOrEqual(a);
          expect(y).toBeLessThanOrEqual(b);
          // Rounding may add one pixel per column.
          if (a + b > available && available >= 100)
            expect(x + y).toBeLessThanOrEqual(available + 1);
        },
      ),
    );
  });
});

describe("gridTemplate", () => {
  it("gives the flexible column the leftover space", () => {
    expect(gridTemplate(specs, [0, 90, 80])).toBe("minmax(100px, 1fr) 90px 80px");
  });

  it("falls back to default widths", () => {
    expect(gridTemplate(specs.slice(1), [])).toBe("100px 100px");
  });
});

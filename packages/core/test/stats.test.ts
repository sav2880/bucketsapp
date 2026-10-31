// SPDX-License-Identifier: Apache-2.0

import { describe, expect, it } from "vitest";
import { chiSquare, chiSquareCritical, countBy } from "./stats";

describe("stats helpers", () => {
  it("counts occurrences of each key", () => {
    expect([...countBy(["a", "b", "a"])]).toEqual([
      ["a", 2],
      ["b", 1],
    ]);
  });

  it("computes the chi-square statistic", () => {
    expect(chiSquare([10, 10], [10, 10])).toBe(0);
    expect(chiSquare([12, 8], [10, 10])).toBeCloseTo(0.8);
  });

  it("rejects mismatched or non-positive expectations", () => {
    expect(() => chiSquare([1], [1, 2])).toThrow(RangeError);
    expect(() => chiSquare([1], [0])).toThrow(RangeError);
  });

  it("approximates the p=0.001 critical value", () => {
    expect(chiSquareCritical(3)).toBeGreaterThan(16.27);
    expect(chiSquareCritical(3)).toBeLessThan(17);
    expect(chiSquareCritical(9)).toBeGreaterThan(27.88);
    expect(chiSquareCritical(9)).toBeLessThan(28.5);
  });
});

// SPDX-License-Identifier: Apache-2.0

import type { DrawRefusal } from "@buckets/core";
import { describe, expect, it } from "vitest";
import { SLIP_SPOTS, bucketVisual, slipLayout } from "./bucket-art-model";

describe("slipLayout", () => {
  it("draws nothing for an empty bucket", () => {
    expect(slipLayout(0, 0)).toEqual([]);
  });

  it("puts a single slip front and centre, and a fuller bucket stands taller", () => {
    const [one] = slipLayout(1, 0);
    expect(one).toMatchObject({ x: 130, rotation: -3, resting: false });
    const front = (count: number): number => slipLayout(count, 0).at(-1)?.y ?? 0;
    expect(front(8)).toBeLessThan(front(1));
  });

  it("draws the front slip last, so it sits on top", () => {
    const slips = slipLayout(3, 0);
    expect(slips.map((s) => s.x)).toEqual([154, 106, 130]);
  });

  it("never draws more slips than there are spots", () => {
    expect(slipLayout(40, 0)).toHaveLength(SLIP_SPOTS.length);
  });

  it("draws resting slips first, grey, low, and at most three", () => {
    const slips = slipLayout(1, 5);
    expect(slips.filter((s) => s.resting)).toHaveLength(3);
    expect(slips.slice(0, 3).every((s) => s.resting && s.y === 62)).toBe(true);
    expect(slips.at(-1)?.resting).toBe(false);
  });

  it("treats negative counts as zero", () => {
    expect(slipLayout(-2, -1)).toEqual([]);
  });

  it("keeps every slip's key unique when the bucket is full and others are resting", () => {
    const keys = slipLayout(12, 3).map((s) => `${s.resting ? "r" : "i"}-${String(s.x)}`);
    expect(new Set(keys).size).toBe(keys.length);
  });
});

describe("bucketVisual", () => {
  const refusal = (r: DrawRefusal): DrawRefusal => r;

  it("leaves the lid off and looks idle when a draw is allowed", () => {
    expect(bucketVisual(undefined)).toEqual({ lidOn: false, mood: "idle" });
  });

  it("leaves the lid off for an empty bucket", () => {
    expect(bucketVisual(refusal({ ok: false, reason: "empty", doneCount: 0 }))).toEqual({
      lidOn: false,
      mood: "idle",
    });
  });

  it("puts the lid on and waits while something must be finished", () => {
    expect(bucketVisual(refusal({ ok: false, reason: "locked", holding: [] }))).toEqual({
      lidOn: true,
      mood: "wait",
    });
    expect(bucketVisual(refusal({ ok: false, reason: "hand-full", holding: [] }))).toEqual({
      lidOn: true,
      mood: "wait",
    });
    expect(bucketVisual(refusal({ ok: false, reason: "not-permitted" }))).toEqual({
      lidOn: true,
      mood: "wait",
    });
  });

  it("puts the lid on and sleeps while everything is cooling down", () => {
    expect(
      bucketVisual(
        refusal({ ok: false, reason: "all-cooling-down", opensAt: "2026-11-01T00:00:00Z" }),
      ),
    ).toEqual({ lidOn: true, mood: "sleep" });
  });
});

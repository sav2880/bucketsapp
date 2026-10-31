// SPDX-License-Identifier: Apache-2.0

import { describe, expect, it, vi } from "vitest";
import { centreOf, instantAnimator, parseBezier } from "./animator";

describe("parseBezier", () => {
  it("reads the four numbers of a CSS cubic-bezier", () => {
    expect(parseBezier("cubic-bezier(0.3, 0.7, 0.2, 1)")).toEqual([0.3, 0.7, 0.2, 1]);
    expect(parseBezier("cubic-bezier(0.4,0,0.2,1)")).toEqual([0.4, 0, 0.2, 1]);
  });

  it("refuses anything else", () => {
    expect(() => parseBezier("ease-in")).toThrow("Not a cubic-bezier");
    expect(() => parseBezier("cubic-bezier(a, b, c, d)")).toThrow("Not a cubic-bezier");
  });
});

describe("centreOf", () => {
  it("is the middle of the box", () => {
    expect(centreOf({ left: 10, top: 20, width: 100, height: 40 })).toEqual({ x: 60, y: 40 });
  });
});

describe("instantAnimator", () => {
  it("does everything at once", async () => {
    const el = document.createElement("div");
    const middle = vi.fn();
    await instantAnimator.wobble(el);
    await instantAnimator.plop(el);
    await instantAnimator.shake(el);
    await instantAnimator.flySlip({ x: 0, y: 0 }, el);
    await instantAnimator.settle(el);
    await instantAnimator.pulse(el);
    await instantAnimator.flip(el, middle);
    expect(middle).toHaveBeenCalledOnce();
    const ghost = instantAnimator.ghost(el);
    await ghost.flyTo({ x: 1, y: 1 });
    ghost.discard();
    instantAnimator.cancelAll();
  });
});

// SPDX-License-Identifier: Apache-2.0

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createFadeAnimator, createMotionAnimator } from "./motion-animator";

/** What `animate` was asked to do, and a handle to finish it early. */
interface Call {
  target: Element;
  keyframes: Record<string, unknown>;
  options: Record<string, unknown>;
  complete: ReturnType<typeof vi.fn>;
}
const calls: Call[] = [];

vi.mock("motion", () => ({
  animate: (
    target: Element,
    keyframes: Record<string, unknown>,
    options: Record<string, unknown>,
  ) => {
    const complete = vi.fn();
    calls.push({ target, keyframes, options, complete });
    return Object.assign(Promise.resolve(), { complete });
  },
}));

const rect = (left: number, top: number, width: number, height: number): DOMRect =>
  ({ left, top, width, height, right: left + width, bottom: top + height }) as DOMRect;

function card(): HTMLElement {
  const el = document.createElement("li");
  el.id = "c1";
  el.dataset["testid"] = "hand-1";
  el.style.setProperty("--enamel", "#123456");
  el.innerHTML = '<button id="b" data-testid="done">Done</button><input tabindex="3">';
  document.body.append(el);
  el.getBoundingClientRect = () => rect(100, 200, 300, 100);
  return el;
}

beforeEach(() => {
  calls.length = 0;
});
afterEach(() => {
  document.body.innerHTML = "";
});

describe("createMotionAnimator", () => {
  it("rocks, squashes and shakes the bucket with the prototype's timings", async () => {
    const a = createMotionAnimator();
    const body = document.createElement("div");
    await a.wobble(body);
    await a.plop(body);
    await a.shake(body);
    expect(calls[0]).toMatchObject({
      target: body,
      keyframes: { rotate: [0, -5, 4, -2, 0] },
      options: { duration: 0.42 },
    });
    expect(calls[1]?.keyframes).toEqual({ scaleX: [1, 1.04, 0.98, 1], scaleY: [1, 0.94, 1.03, 1] });
    expect(calls[1]?.options["duration"]).toBe(0.36);
    expect(calls[2]?.keyframes).toEqual({ x: [0, -6, 6, -4, 0] });
  });

  it("flies a slip from the bucket mouth to the middle of the card, then removes it", async () => {
    const a = createMotionAnimator();
    const c = card();
    await a.flySlip({ x: 150, y: 100 }, c);
    const call = calls[0];
    // Card centre is (250, 250): 100 across and 150 down from the mouth.
    expect(call?.keyframes["x"]).toEqual([0, 0, 100]);
    expect(call?.keyframes["y"]).toEqual([26, -64, 150]);
    expect(call?.keyframes["scaleX"]).toEqual([0.8, 1, 300 / 34]);
    expect(call?.keyframes["scaleY"]).toEqual([0.8, 1, 2]);
    expect(call?.options).toMatchObject({ duration: 0.78, times: [0, 0.42, 1] });
    const slip = call?.target as HTMLElement;
    expect(slip.getAttribute("aria-hidden")).toBe("true");
    expect(slip.style.getPropertyValue("--enamel")).toBe("#123456");
    expect(document.body.contains(slip)).toBe(false);
  });

  it("turns a card over in two halves and reveals in between", async () => {
    const a = createMotionAnimator();
    const middle = vi.fn(() => {
      expect(calls).toHaveLength(1);
    });
    await a.flip(card(), middle);
    expect(middle).toHaveBeenCalledOnce();
    expect(calls.map((c) => c.keyframes["rotateY"])).toEqual([
      [0, 90],
      [-90, 0],
    ]);
  });

  it("settles a card and pulses a target", async () => {
    const a = createMotionAnimator();
    const el = card();
    await a.settle(el);
    await a.pulse(el);
    expect(calls[0]?.keyframes).toEqual({ scale: [0.97, 1] });
    expect(calls[1]?.keyframes).toEqual({ scale: [1, 1.1, 1] });
  });

  it("leaves a copy of a card that can't be found, focused or read", () => {
    const a = createMotionAnimator();
    const c = card();
    a.ghost(c);
    const copy = document.body.querySelector(".bk-ghost") as HTMLElement;
    expect(copy.getAttribute("aria-hidden")).toBe("true");
    expect(copy.id).toBe("");
    expect(copy.querySelector("[id], [data-testid]")).toBeNull();
    expect(copy.dataset["testid"]).toBeUndefined();
    expect(
      [...copy.querySelectorAll("button, input")].every((e) => e.getAttribute("tabindex") === "-1"),
    ).toBe(true);
    expect(copy.style.left).toBe("100px");
    expect(copy.style.width).toBe("300px");
    expect(copy.style.getPropertyValue("--enamel")).toBe("#123456");
    // The real card is untouched.
    expect(c.id).toBe("c1");
  });

  it("flies the copy to a point and then removes it", async () => {
    const a = createMotionAnimator();
    const ghost = a.ghost(card());
    await ghost.flyTo({ x: 450, y: 50 });
    const call = calls[0];
    // The card centre is (250, 250); the target is 200 right and 200 up.
    expect(call?.keyframes["x"]).toEqual([0, 100, 200]);
    expect(call?.keyframes["y"]).toEqual([0, -100 * 1 - 50, -200]);
    expect(call?.keyframes["scale"]).toEqual([1, 0.5, 0.1]);
    expect(document.body.querySelector(".bk-ghost")).toBeNull();
  });

  it("can discard a copy without flying it", () => {
    const a = createMotionAnimator();
    a.ghost(card()).discard();
    expect(document.body.querySelector(".bk-ghost")).toBeNull();
  });

  it("finishes what is running and clears floating copies when cancelled", () => {
    const a = createMotionAnimator();
    const body = document.createElement("div");
    void a.wobble(body);
    a.ghost(card());
    a.cancelAll();
    expect(calls[0]?.complete).toHaveBeenCalledOnce();
    expect(document.body.querySelector(".bk-ghost")).toBeNull();
  });
});

describe("createFadeAnimator", () => {
  it("does not move anything", async () => {
    const a = createFadeAnimator();
    const body = document.createElement("div");
    await a.wobble(body);
    await a.plop(body);
    await a.shake(body);
    await a.settle(body);
    await a.pulse(body);
    expect(calls).toHaveLength(0);
  });

  it("fades a card in where a slip would have flown", async () => {
    const a = createFadeAnimator();
    const c = card();
    await a.flySlip({ x: 0, y: 0 }, c);
    expect(calls[0]).toMatchObject({
      target: c,
      keyframes: { opacity: [0, 1] },
      options: { duration: 0.15 },
    });
  });

  it("reveals at once and fades instead of flipping", async () => {
    const a = createFadeAnimator();
    const middle = vi.fn();
    await a.flip(card(), middle);
    expect(middle).toHaveBeenCalledOnce();
    expect(calls[0]?.keyframes).toEqual({ opacity: [0, 1] });
  });

  it("fades a copy out and removes it", async () => {
    const a = createFadeAnimator();
    const ghost = a.ghost(card());
    const copy = document.body.querySelector(".bk-ghost") as HTMLElement;
    expect(copy.getAttribute("aria-hidden")).toBe("true");
    await ghost.flyTo({ x: 0, y: 0 });
    expect(calls[0]?.keyframes).toEqual({ opacity: [1, 0] });
    expect(document.body.querySelector(".bk-ghost")).toBeNull();
  });

  it("can discard a copy and cancel what is running", () => {
    const a = createFadeAnimator();
    a.ghost(card()).discard();
    void a.flySlip({ x: 0, y: 0 }, card());
    a.cancelAll();
    expect(calls[0]?.complete).toHaveBeenCalled();
    expect(document.body.querySelector(".bk-ghost")).toBeNull();
  });
});

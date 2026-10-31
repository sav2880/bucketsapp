// SPDX-License-Identifier: Apache-2.0

import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { moveBefore, moveBy, nextSelection, titlesFromPaste } from "./list-ordering";

const order = ["a", "b", "c", "d", "e"];
const none = { toggle: false, range: false };

describe("nextSelection", () => {
  it("selects just the clicked row", () => {
    expect(nextSelection(order, ["a", "b"], "a", "d", none)).toEqual({
      selected: ["d"],
      anchor: "d",
    });
  });

  it("adds and removes single rows with the toggle key, in display order", () => {
    expect(nextSelection(order, ["d"], "d", "b", { toggle: true, range: false }).selected).toEqual([
      "b",
      "d",
    ]);
    expect(
      nextSelection(order, ["b", "d"], "b", "b", { toggle: true, range: false }).selected,
    ).toEqual(["d"]);
  });

  it("extends from the anchor in either direction", () => {
    expect(nextSelection(order, ["b"], "b", "d", { toggle: false, range: true })).toEqual({
      selected: ["b", "c", "d"],
      anchor: "b",
    });
    expect(nextSelection(order, ["d"], "d", "b", { toggle: false, range: true }).selected).toEqual([
      "b",
      "c",
      "d",
    ]);
  });

  it("treats a range with no usable anchor as a plain click", () => {
    expect(nextSelection(order, [], undefined, "c", { toggle: false, range: true })).toEqual({
      selected: ["c"],
      anchor: "c",
    });
    expect(nextSelection(order, [], "gone", "c", { toggle: false, range: true }).selected).toEqual([
      "c",
    ]);
  });
});

describe("moveBy", () => {
  it("moves one row up or down", () => {
    expect(moveBy(order, ["c"], -1)).toEqual(["a", "c", "b", "d", "e"]);
    expect(moveBy(order, ["c"], 1)).toEqual(["a", "b", "d", "c", "e"]);
  });

  it("moves a block together and stops at the edge", () => {
    expect(moveBy(order, ["b", "c"], 1)).toEqual(["a", "d", "b", "c", "e"]);
    expect(moveBy(order, ["a", "b"], -1)).toEqual(order);
    expect(moveBy(order, ["e"], 1)).toEqual(order);
  });

  it("moves separate rows, each past its neighbor", () => {
    expect(moveBy(order, ["b", "d"], -1)).toEqual(["b", "a", "d", "c", "e"]);
  });

  it("always returns the same rows", () => {
    fc.assert(
      fc.property(fc.subarray(order), fc.constantFrom(-1 as const, 1 as const), (ids, delta) => {
        expect([...moveBy(order, ids, delta)].sort()).toEqual(order);
      }),
    );
  });
});

describe("moveBefore", () => {
  it("drops rows before the target, keeping their own order", () => {
    expect(moveBefore(order, ["d", "b"], "a")).toEqual(["b", "d", "a", "c", "e"]);
    expect(moveBefore(order, ["a"], "d")).toEqual(["b", "c", "a", "d", "e"]);
  });

  it("drops at the end without a target, or on one of the dragged rows", () => {
    expect(moveBefore(order, ["a"], undefined)).toEqual(["b", "c", "d", "e", "a"]);
    expect(moveBefore(order, ["a", "b"], "b")).toEqual(["c", "d", "e", "a", "b"]);
  });
});

describe("titlesFromPaste", () => {
  it("makes one title per line and strips list markers", () => {
    expect(
      titlesFromPaste("- Hades\n* Celeste\r\n1. Tunic\n2) Hollow Knight\n• Dave\n\n   \nPlain"),
    ).toEqual(["Hades", "Celeste", "Tunic", "Hollow Knight", "Dave", "Plain"]);
  });

  it("keeps a title that merely starts with a dash-like word", () => {
    expect(titlesFromPaste("-Not a marker\n2026 plans")).toEqual(["-Not a marker", "2026 plans"]);
  });
});

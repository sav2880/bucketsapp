// SPDX-License-Identifier: Apache-2.0

import {
  createBucket,
  type Bucket,
  type DrawCheck,
  type DrawRefusal,
  type Item,
  type ItemState,
} from "@buckets/core";
import { describe, expect, it } from "vitest";
import {
  describeDrawRefusal,
  describeReady,
  describeResolveRefusal,
  titleHidden,
} from "./draw-messages";

const when = (iso: string): string => `at ${iso}`;
const item = (title: string): Item => ({ id: title, title }) as Item;

describe("describeDrawRefusal", () => {
  it.each<[DrawRefusal, string]>([
    [
      { ok: false, reason: "locked", holding: [item("Hades"), item("Celeste")] },
      "Finish or toss back Hades, Celeste before drawing again.",
    ],
    [
      { ok: false, reason: "hand-full", holding: [] },
      "Your hand is full. Finish or toss back an item first.",
    ],
    [{ ok: false, reason: "empty", doneCount: 0 }, "Nothing to draw. Add an item first."],
    [{ ok: false, reason: "empty", doneCount: 3 }, "Everything has been finished."],
    [
      { ok: false, reason: "all-cooling-down", opensAt: "2026-11-01T09:00:00Z" },
      "Everything is resting. The next item is ready at 2026-11-01T09:00:00Z.",
    ],
    [{ ok: false, reason: "not-permitted" }, "You can't draw from this bucket."],
  ])("explains %j", (refusal, text) => {
    expect(describeDrawRefusal(refusal, when)).toBe(text);
  });
});

describe("describeResolveRefusal", () => {
  it("explains each reason, with a plural for steps", () => {
    expect(describeResolveRefusal({ ok: false, reason: "steps-incomplete", remaining: 1 })).toBe(
      "Finish the last step first.",
    );
    expect(describeResolveRefusal({ ok: false, reason: "steps-incomplete", remaining: 3 })).toBe(
      "Finish the 3 remaining steps first.",
    );
    expect(describeResolveRefusal({ ok: false, reason: "not-in-hand" })).toBe(
      "That item isn't in your hand any more.",
    );
    expect(describeResolveRefusal({ ok: false, reason: "not-permitted" })).toBe(
      "You can't draw from this bucket.",
    );
  });
});

describe("titleHidden", () => {
  it("hides titles of waiting items only when the bucket asks for it", () => {
    const bucket = createBucket(
      { name: "x", ownerName: "Me" },
      { memberId: "me", now: new Date(), makeId: () => "b" },
    );
    expect(titleHidden(bucket, "in")).toBe(false);
    bucket.rules.hideTitlesUntilDrawn = true;
    expect(titleHidden(bucket, "in")).toBe(true);
    expect(titleHidden(bucket, "cooling")).toBe(true);
    expect(titleHidden(bucket, "hand")).toBe(false);
    expect(titleHidden(bucket, "done")).toBe(false);
  });
});

describe("describeReady", () => {
  const bucket = (rules: Partial<Bucket["rules"]>): Bucket => {
    const b = createBucket(
      { name: "B", ownerName: "Me" },
      { memberId: "me", now: new Date(0), makeId: () => "x" },
    );
    Object.assign(b.rules, rules);
    b.itemOrder.push("a", "b", "c");
    return b;
  };
  const ok = (candidates: number, needsCycleReset = false): Extract<DrawCheck, { ok: true }> => ({
    ok: true,
    count: 1,
    candidates: Array.from({ length: candidates }, () => ({}) as ItemState),
    needsCycleReset,
  });

  it("counts the items inside", () => {
    expect(describeReady(bucket({}), ok(3), 1)).toBe("1 item inside.");
    expect(describeReady(bucket({}), ok(3), 3)).toBe("3 items inside.");
  });

  it("counts folded slips in a Mystery Bag", () => {
    const b = bucket({ hideTitlesUntilDrawn: true });
    expect(describeReady(b, ok(3), 1)).toBe("1 folded slip inside. No peeking.");
    expect(describeReady(b, ok(3), 2)).toBe("2 folded slips inside. No peeking.");
  });

  it("says how many are waiting for a turn when items don't repeat", () => {
    expect(describeReady(bucket({ noRepeat: "until-cycle-complete" }), ok(2), 3)).toBe(
      "2 of 3 are waiting for a turn this round.",
    );
  });

  it("says a new round is next when everyone has had a turn", () => {
    expect(describeReady(bucket({ noRepeat: "until-cycle-complete" }), ok(3, true), 3)).toBe(
      "Everything has had a turn. The next draw starts a new round.",
    );
  });
});

// SPDX-License-Identifier: Apache-2.0

import { createBucket, type DrawRefusal, type Item } from "@buckets/core";
import { describe, expect, it } from "vitest";
import { describeDrawRefusal, describeResolveRefusal, titleHidden } from "./draw-messages";

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

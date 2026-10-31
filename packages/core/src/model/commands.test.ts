// SPDX-License-Identifier: Apache-2.0

import { describe, expect, it } from "vitest";
import {
  addBucketRef,
  addItem,
  addStep,
  applyEvents,
  canDraw,
  canEdit,
  createBucket,
  createLibrary,
  reorderItems,
  setItemArchived,
  setItemWeight,
  setRules,
  setStepDone,
  type CommandContext,
} from "./commands";
import { PRESETS } from "./presets";
import type { Bucket, DrawEvent, MemberRole } from "./types";

const NOW = new Date("2026-10-30T09:00:00.000Z");

function context(memberId = "me"): CommandContext {
  let n = 0;
  return { memberId, now: NOW, makeId: () => `id-${String(++n)}` };
}

function bucketWithMember(role: MemberRole): { bucket: Bucket; ctx: CommandContext } {
  const bucket = createBucket({ name: "Games", ownerName: "Me" }, context("me"));
  bucket.members["you"] = {
    memberId: "you",
    displayName: "You",
    role,
    devicePublicKeys: [],
    joinedAt: NOW.toISOString(),
  };
  return { bucket, ctx: context("you") };
}

function ok<T>(result: { ok: true; value: T } | { ok: false; reason: string }): T {
  if (!result.ok) throw new Error(`expected success, got ${result.reason}`);
  return result.value;
}

describe("roles", () => {
  it("lets owners and editors edit, and everyone but viewers draw", () => {
    expect(["owner", "editor", "drawer", "viewer"].map((r) => canEdit(r as MemberRole))).toEqual([
      true,
      true,
      false,
      false,
    ]);
    expect(["owner", "editor", "drawer", "viewer"].map((r) => canDraw(r as MemberRole))).toEqual([
      true,
      true,
      true,
      false,
    ]);
    expect(canEdit(undefined)).toBe(false);
    expect(canDraw(undefined)).toBe(false);
  });
});

describe("createBucket", () => {
  it("starts empty with the creator as owner and the preset's rules", () => {
    const bucket = createBucket(
      { name: "Chores", preset: "round-robin", ownerName: "Me" },
      context(),
    );
    expect(bucket.members["me"]?.role).toBe("owner");
    expect(bucket.rules).toEqual(PRESETS["round-robin"].rules);
    expect(bucket.preset).toBe("round-robin");
    expect(bucket.items).toEqual({});
    expect(bucket.createdAt).toBe("2026-10-30T09:00:00.000Z");
    expect(bucket.schemaVersion).toBe(1);
  });

  it("copies the preset rules so editing the bucket cannot change the preset", () => {
    const bucket = createBucket({ name: "Chores", ownerName: "Me" }, context());
    bucket.rules.maxInHand = 9;
    expect(PRESETS["grab-and-go"].rules.maxInHand).toBe(1);
  });

  it("honors a chosen icon and color", () => {
    const bucket = createBucket(
      { name: "A", icon: "star", color: "green", ownerName: "Me" },
      context(),
    );
    expect([bucket.icon, bucket.color]).toEqual(["star", "green"]);
  });
});

describe("addItem", () => {
  it("adds an item at the end, trimmed, with defaults", () => {
    const { bucket } = bucketWithMember("editor");
    const ctx = context("me");
    const first = ok(addItem(bucket, { title: "  Zelda " }, ctx));
    const second = ok(addItem(bucket, { title: "Mario", notes: "n", tags: ["a"], weight: 3 }, ctx));
    expect(bucket.itemOrder).toEqual([first, second]);
    expect(bucket.items[first]).toMatchObject({
      title: "Zelda",
      weight: 1,
      archived: false,
      createdBy: "me",
    });
    expect(bucket.items[first]).not.toHaveProperty("notes");
    expect(bucket.items[second]).toMatchObject({ notes: "n", tags: ["a"], weight: 3 });
  });

  it("refuses blank titles, bad weights and members who may not edit", () => {
    const owner = context("me");
    const { bucket, ctx: drawer } = bucketWithMember("drawer");
    expect(addItem(bucket, { title: "  " }, owner)).toEqual({ ok: false, reason: "empty-title" });
    expect(addItem(bucket, { title: "x", weight: -1 }, owner)).toEqual({
      ok: false,
      reason: "invalid-weight",
    });
    expect(addItem(bucket, { title: "x", weight: Number.NaN }, owner)).toEqual({
      ok: false,
      reason: "invalid-weight",
    });
    expect(addItem(bucket, { title: "x" }, drawer)).toEqual({ ok: false, reason: "not-permitted" });
    expect(addItem(bucket, { title: "x" }, context("stranger"))).toEqual({
      ok: false,
      reason: "not-permitted",
    });
    expect(bucket.itemOrder).toEqual([]);
  });
});

describe("item changes", () => {
  it("archives and restores an item", () => {
    const { bucket } = bucketWithMember("editor");
    const ctx = context("me");
    const id = ok(addItem(bucket, { title: "A" }, ctx));
    ok(setItemArchived(bucket, id, true, ctx));
    expect(bucket.items[id]?.archived).toBe(true);
    ok(setItemArchived(bucket, id, false, ctx));
    expect(bucket.items[id]?.archived).toBe(false);
  });

  it("sets a weight, allowing zero", () => {
    const { bucket } = bucketWithMember("editor");
    const ctx = context("me");
    const id = ok(addItem(bucket, { title: "A" }, ctx));
    ok(setItemWeight(bucket, id, 0, ctx));
    expect(bucket.items[id]?.weight).toBe(0);
    expect(setItemWeight(bucket, id, -2, ctx)).toEqual({ ok: false, reason: "invalid-weight" });
    expect(setItemWeight(bucket, "nope", 1, ctx)).toEqual({ ok: false, reason: "unknown-item" });
  });

  it("refuses edits from members who may not edit", () => {
    const { bucket, ctx: viewer } = bucketWithMember("viewer");
    const id = ok(addItem(bucket, { title: "A" }, context("me")));
    expect(setItemArchived(bucket, id, true, viewer)).toEqual({
      ok: false,
      reason: "not-permitted",
    });
  });
});

describe("steps", () => {
  it("adds steps and lets a drawer tick them", () => {
    const { bucket, ctx: drawer } = bucketWithMember("drawer");
    const owner = context("me");
    const item = ok(addItem(bucket, { title: "Clean" }, owner));
    const step = ok(addStep(bucket, item, " Vacuum ", owner));
    expect(bucket.items[item]?.steps).toEqual([{ id: step, title: "Vacuum", done: false }]);

    ok(setStepDone(bucket, item, step, true, drawer));
    expect(bucket.items[item]?.steps[0]).toMatchObject({
      done: true,
      doneBy: "you",
      doneAt: "2026-10-30T09:00:00.000Z",
    });

    ok(setStepDone(bucket, item, step, false, drawer));
    expect(bucket.items[item]?.steps[0]).toEqual({ id: step, title: "Vacuum", done: false });
  });

  it("refuses blank steps, unknown ids and viewers", () => {
    const { bucket, ctx: viewer } = bucketWithMember("viewer");
    const owner = context("me");
    const item = ok(addItem(bucket, { title: "Clean" }, owner));
    const step = ok(addStep(bucket, item, "Vacuum", owner));
    expect(addStep(bucket, item, " ", owner)).toEqual({ ok: false, reason: "empty-title" });
    expect(addStep(bucket, "nope", "x", owner)).toEqual({ ok: false, reason: "unknown-item" });
    expect(setStepDone(bucket, "nope", step, true, owner)).toEqual({
      ok: false,
      reason: "unknown-item",
    });
    expect(setStepDone(bucket, item, "nope", true, owner)).toEqual({
      ok: false,
      reason: "unknown-step",
    });
    expect(setStepDone(bucket, item, step, true, viewer)).toEqual({
      ok: false,
      reason: "not-permitted",
    });
  });
});

describe("reorderItems", () => {
  it("accepts a permutation and refuses anything else", () => {
    const { bucket } = bucketWithMember("editor");
    const ctx = context("me");
    const a = ok(addItem(bucket, { title: "A" }, ctx));
    const b = ok(addItem(bucket, { title: "B" }, ctx));
    ok(reorderItems(bucket, [b, a], ctx));
    expect(bucket.itemOrder).toEqual([b, a]);
    expect(reorderItems(bucket, [a], ctx)).toEqual({ ok: false, reason: "invalid-order" });
    expect(reorderItems(bucket, [a, a], ctx)).toEqual({ ok: false, reason: "invalid-order" });
    expect(reorderItems(bucket, [a, "x"], ctx)).toEqual({ ok: false, reason: "invalid-order" });
    expect(reorderItems(bucket, [a, b], context("stranger"))).toEqual({
      ok: false,
      reason: "not-permitted",
    });
  });
});

describe("setRules", () => {
  it("relabels the preset, falling back to custom", () => {
    const { bucket } = bucketWithMember("editor");
    const ctx = context("me");
    ok(setRules(bucket, { ...bucket.rules, maxInHand: 3 }, ctx));
    expect(bucket.preset).toBe("custom");
    ok(setRules(bucket, PRESETS["grab-and-go"].rules, ctx));
    expect(bucket.preset).toBe("grab-and-go");
  });

  it("keeps a nested bucket nested while its rules stay at the base", () => {
    const bucket = createBucket({ name: "N", preset: "nested", ownerName: "Me" }, context("me"));
    ok(setRules(bucket, PRESETS.nested.rules, context("me")));
    expect(bucket.preset).toBe("nested");
    ok(setRules(bucket, { ...PRESETS.nested.rules, drawCount: 2, maxInHand: 2 }, context("me")));
    expect(bucket.preset).toBe("custom");
  });

  it.each([
    { drawCount: 0 },
    { maxInHand: 1.5 },
    { agingRatePerDay: -1 },
    { agingRatePerDay: Number.NaN },
    { autoReturnAt: "24:00" },
    { autoReturnAt: "9:00" },
  ])("refuses invalid rules %j", (patch) => {
    const bucket = createBucket({ name: "N", ownerName: "Me" }, context("me"));
    const before = { ...bucket.rules };
    expect(setRules(bucket, { ...bucket.rules, ...patch }, context("me"))).toEqual({
      ok: false,
      reason: "invalid-rules",
    });
    expect(bucket.rules).toEqual(before);
  });

  it("accepts a valid time of day and refuses non-editors", () => {
    const { bucket, ctx: viewer } = bucketWithMember("viewer");
    ok(
      setRules(
        bucket,
        { ...bucket.rules, autoReturnAt: "04:30", agingRatePerDay: 0 },
        context("me"),
      ),
    );
    expect(bucket.rules.autoReturnAt).toBe("04:30");
    expect(setRules(bucket, bucket.rules, viewer)).toEqual({ ok: false, reason: "not-permitted" });
  });
});

describe("applyEvents", () => {
  it("appends in order", () => {
    const bucket = createBucket({ name: "A", ownerName: "Me" }, context());
    const event = (id: string): DrawEvent => ({
      id,
      itemId: "i",
      kind: "drawn",
      at: NOW.toISOString(),
      memberId: "me",
      deviceId: "d",
    });
    applyEvents(bucket, [event("1"), event("2")]);
    applyEvents(bucket, [event("3")]);
    expect(bucket.events.map((e) => e.id)).toEqual(["1", "2", "3"]);
  });
});

describe("library", () => {
  it("starts empty with default settings and the chosen name", () => {
    const library = createLibrary("Me", context());
    expect(library).toEqual({
      id: "id-1",
      schemaVersion: 1,
      buckets: {},
      bucketOrder: [],
      reminders: {},
      settings: { appearance: "system" },
      profile: { displayName: "Me" },
    });
  });

  it("adds bucket pointers once, in order, and updates an existing pointer", () => {
    const library = createLibrary("Me", context());
    const ref = { bucketId: "b1", keyId: "k1", role: "owner" as const, addedAt: NOW.toISOString() };
    addBucketRef(library, ref);
    addBucketRef(library, { ...ref, bucketId: "b2" });
    addBucketRef(library, { ...ref, role: "viewer" });
    expect(library.bucketOrder).toEqual(["b1", "b2"]);
    expect(library.buckets["b1"]?.role).toBe("viewer");
  });
});

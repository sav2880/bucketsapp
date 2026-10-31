// SPDX-License-Identifier: Apache-2.0

import { describe, expect, it } from "vitest";
import { HOUR, T0, applyOk, idMaker, makeBucket, request } from "../../test/builders";
import { duration } from "../duration";
import { addStep, applyEvents, setStepDone } from "../model/commands";
import { createSeededRng } from "../random/rng";
import { draw } from "./draw";
import { resolve, type ResolveRequest } from "./resolve";

const base = (
  overrides: Partial<ResolveRequest> & Pick<ResolveRequest, "itemId" | "kind">,
): ResolveRequest => ({
  memberId: "me",
  deviceId: "d1",
  now: new Date(T0 + HOUR),
  makeId: idMaker("r"),
  ...overrides,
});

function held(options: Parameters<typeof makeBucket>[0] = {}, memberId = "me") {
  const bucket = makeBucket({ items: 1, ...options });
  const [id = ""] = applyOk(
    bucket,
    draw(bucket, request(createSeededRng(1), T0, idMaker("e"), memberId)),
  );
  return { bucket, id };
}

describe("resolve", () => {
  it("refuses items that are not in hand", () => {
    const bucket = makeBucket({ items: 1 });
    expect(resolve(bucket, base({ itemId: "i0", kind: "done" }))).toEqual({
      ok: false,
      reason: "not-in-hand",
    });
    expect(resolve(bucket, base({ itemId: "nope", kind: "tossed-back" }))).toEqual({
      ok: false,
      reason: "not-in-hand",
    });
  });

  it("snapshots the rules in force when finishing, so later edits do not rewrite history", () => {
    const { bucket, id } = held({ preset: "mystery-bag" });
    const result = resolve(bucket, base({ itemId: id, kind: "done" }));
    if (!result.ok) throw new Error("expected success");
    expect(result.event).toMatchObject({
      kind: "done",
      onDone: "return",
      cooldown: duration(24, "hours"),
      at: new Date(T0 + HOUR).toISOString(),
    });
    bucket.rules.cooldown = duration(1, "hours");
    expect(result.event.cooldown).toEqual(duration(24, "hours"));
  });

  it("leaves out the cooldown when the item is removed or there is none", () => {
    const removed = held({ preset: "grab-and-go" });
    const event = resolve(removed.bucket, base({ itemId: removed.id, kind: "done" }));
    expect(event.ok && event.event).toMatchObject({ onDone: "remove" });
    expect(event.ok && event.event).not.toHaveProperty("cooldown");

    const noCooldown = held({ preset: "weighted" });
    const plain = resolve(noCooldown.bucket, base({ itemId: noCooldown.id, kind: "done" }));
    expect(plain.ok && plain.event).not.toHaveProperty("cooldown");
  });

  it("carries both kinds of toss-back reason and the countsAsDrawn snapshot", () => {
    const { bucket, id } = held({ rules: { tossBackCountsAsDrawn: true } });
    const result = resolve(
      bucket,
      base({ itemId: id, kind: "tossed-back", note: "busy", privateNote: "ciphertext" }),
    );
    expect(result.ok && result.event).toMatchObject({
      note: "busy",
      privateNote: "ciphertext",
      countsAsDrawn: true,
    });
    const bare = resolve(bucket, base({ itemId: id, kind: "tossed-back" }));
    expect(bare.ok && bare.event).not.toHaveProperty("note");
    expect(bare.ok && bare.event).not.toHaveProperty("privateNote");
  });

  it("requires every step when the rule says so", () => {
    const { bucket, id } = held({ rules: { requireAllSteps: true } });
    const ctx = { memberId: "me", now: new Date(T0), makeId: idMaker("s") };
    const one = addStep(bucket, id, "one", ctx);
    addStep(bucket, id, "two", ctx);
    expect(resolve(bucket, base({ itemId: id, kind: "done" }))).toEqual({
      ok: false,
      reason: "steps-incomplete",
      remaining: 2,
    });
    if (one.ok) setStepDone(bucket, id, one.value, true, ctx);
    expect(resolve(bucket, base({ itemId: id, kind: "done" }))).toEqual({
      ok: false,
      reason: "steps-incomplete",
      remaining: 1,
    });
    expect(resolve(bucket, base({ itemId: id, kind: "tossed-back" })).ok).toBe(true);
  });

  it("lets the holder and editors resolve, but not other drawers, viewers or strangers", () => {
    const { bucket, id } = held(
      {
        preset: "round-robin",
        members: { you: "drawer", boss: "editor", watcher: "viewer", other: "drawer" },
      },
      "you",
    );
    expect(resolve(bucket, base({ itemId: id, kind: "done", memberId: "other" }))).toEqual({
      ok: false,
      reason: "not-permitted",
    });
    expect(resolve(bucket, base({ itemId: id, kind: "done", memberId: "watcher" }))).toEqual({
      ok: false,
      reason: "not-permitted",
    });
    expect(resolve(bucket, base({ itemId: id, kind: "done", memberId: "stranger" }))).toEqual({
      ok: false,
      reason: "not-permitted",
    });
    expect(resolve(bucket, base({ itemId: id, kind: "done", memberId: "boss" })).ok).toBe(true);
    expect(resolve(bucket, base({ itemId: id, kind: "done", memberId: "you" })).ok).toBe(true);
  });

  it("does not change the bucket", () => {
    const { bucket, id } = held();
    const before = JSON.stringify(bucket);
    resolve(bucket, base({ itemId: id, kind: "done" }));
    expect(JSON.stringify(bucket)).toBe(before);
  });
});

describe("applyEvents with steps", () => {
  it("clears step progress when an item returns, but not when it is removed", () => {
    for (const [onDone, expectedDone] of [
      ["return", false],
      ["remove", true],
    ] as const) {
      const { bucket, id } = held({ rules: { onDone } });
      const ctx = { memberId: "me", now: new Date(T0), makeId: idMaker("s") };
      const step = addStep(bucket, id, "one", ctx);
      if (step.ok) setStepDone(bucket, id, step.value, true, ctx);
      const result = resolve(bucket, base({ itemId: id, kind: "done" }));
      if (!result.ok) throw new Error("expected success");
      applyEvents(bucket, [result.event]);
      const after = bucket.items[id]?.steps[0];
      expect(after?.done).toBe(expectedDone);
      expect(after !== undefined && "doneBy" in after).toBe(expectedDone);
    }
  });

  it("keeps step progress when resetStepsOnReturn is off", () => {
    const { bucket, id } = held({ rules: { resetStepsOnReturn: false } });
    const ctx = { memberId: "me", now: new Date(T0), makeId: idMaker("s") };
    const step = addStep(bucket, id, "one", ctx);
    if (step.ok) setStepDone(bucket, id, step.value, true, ctx);
    const result = resolve(bucket, base({ itemId: id, kind: "done" }));
    if (result.ok) applyEvents(bucket, [result.event]);
    expect(bucket.items[id]?.steps[0]?.done).toBe(true);
  });
});

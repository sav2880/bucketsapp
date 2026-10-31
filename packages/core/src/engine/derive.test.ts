// SPDX-License-Identifier: Apache-2.0

import { describe, expect, it } from "vitest";
import { duration } from "../duration";
import {
  addItem,
  addStep,
  createBucket,
  setStepDone,
  type CommandContext,
} from "../model/commands";
import type { Bucket, DrawEvent } from "../model/types";
import { createSeededRng, randomInt } from "../random/rng";
import { deriveItems, isStale, sortEvents } from "./derive";

const T0 = Date.UTC(2026, 8, 30, 9);
const HOUR = 3_600_000;
const at = (offsetHours: number): string => new Date(T0 + offsetHours * HOUR).toISOString();
const when = (offsetHours: number): Date => new Date(T0 + offsetHours * HOUR);

function setup(itemCount = 2): { bucket: Bucket; ids: string[] } {
  let n = 0;
  const ctx: CommandContext = {
    memberId: "me",
    now: new Date(T0),
    makeId: () => `x${String(++n)}`,
  };
  const bucket = createBucket({ name: "B", ownerName: "Me" }, ctx);
  const ids: string[] = [];
  for (let i = 0; i < itemCount; i++) {
    const added = addItem(bucket, { title: `Item ${String(i)}` }, ctx);
    if (added.ok) ids.push(added.value);
  }
  return { bucket, ids };
}

let eventCounter = 0;
function event(
  kind: DrawEvent["kind"],
  itemId: string,
  hours: number,
  extra: Partial<DrawEvent> = {},
): DrawEvent {
  return {
    id: `e${String(++eventCounter).padStart(4, "0")}`,
    itemId,
    kind,
    at: at(hours),
    memberId: "me",
    deviceId: "d1",
    ...extra,
  };
}

function stateOf(bucket: Bucket, id: string, now: Date) {
  const found = deriveItems(bucket, now).find((s) => s.item.id === id);
  if (!found) throw new Error("no such item");
  return found;
}

describe("deriveItems", () => {
  it("starts every item in the bucket, in bucket order", () => {
    const { bucket, ids } = setup(3);
    const states = deriveItems(bucket, when(0));
    expect(states.map((s) => s.item.id)).toEqual(ids);
    expect(states.every((s) => s.status === "in" && s.timesDrawn === 0 && !s.drawnThisCycle)).toBe(
      true,
    );
  });

  it("follows bucket order after a reorder and skips ids with no item", () => {
    const { bucket, ids } = setup(2);
    bucket.itemOrder = [ids[1] ?? "", "ghost", ids[0] ?? ""];
    expect(deriveItems(bucket, when(0)).map((s) => s.item.id)).toEqual([ids[1], ids[0]]);
  });

  it("marks a drawn item as held, by whom and since when", () => {
    const { bucket, ids } = setup();
    const [a = ""] = ids;
    bucket.events.push(event("drawn", a, 1, { memberId: "you" }));
    expect(stateOf(bucket, a, when(2))).toMatchObject({
      status: "hand",
      heldBy: "you",
      heldSince: at(1),
      lastDrawnAt: at(1),
      timesDrawn: 1,
      drawnThisCycle: true,
    });
  });

  it("returns a finished item to the bucket, resting until its cooldown ends", () => {
    const { bucket, ids } = setup();
    const [a = ""] = ids;
    bucket.events.push(
      event("drawn", a, 1),
      event("done", a, 2, { onDone: "return", cooldown: duration(24, "hours") }),
    );
    expect(stateOf(bucket, a, when(3))).toMatchObject({
      status: "cooling",
      cooldownUntil: at(26),
      timesDone: 1,
      heldBy: null,
    });
    expect(stateOf(bucket, a, when(25.99)).status).toBe("cooling");
    expect(stateOf(bucket, a, when(26)).status).toBe("in");
  });

  it("returns a finished item at once when there is no cooldown", () => {
    const { bucket, ids } = setup();
    const [a = ""] = ids;
    bucket.events.push(event("drawn", a, 1), event("done", a, 2));
    expect(stateOf(bucket, a, when(2))).toMatchObject({
      status: "in",
      cooldownUntil: null,
      lastDoneAt: at(2),
    });
  });

  it("takes a finished item out for good when the rule then said remove", () => {
    const { bucket, ids } = setup();
    const [a = ""] = ids;
    bucket.events.push(event("drawn", a, 1), event("done", a, 2, { onDone: "remove" }));
    expect(stateOf(bucket, a, when(99)).status).toBe("done");
  });

  it.each([
    { countsAsDrawn: false, expected: false },
    { countsAsDrawn: true, expected: true },
  ])(
    "a toss-back with countsAsDrawn=$countsAsDrawn leaves drawnThisCycle=$expected",
    ({ countsAsDrawn, expected }) => {
      const { bucket, ids } = setup();
      const [a = ""] = ids;
      bucket.events.push(
        event("drawn", a, 1),
        event("tossed-back", a, 2, { countsAsDrawn, note: "not now" }),
      );
      expect(stateOf(bucket, a, when(3))).toMatchObject({
        status: "in",
        drawnThisCycle: expected,
        heldBy: null,
        timesDrawn: 1,
      });
    },
  );

  it("a toss-back restores the flag the item had before that draw", () => {
    const { bucket, ids } = setup();
    const [a = ""] = ids;
    bucket.events.push(
      event("drawn", a, 1),
      event("done", a, 2),
      event("drawn", a, 3),
      event("tossed-back", a, 4),
    );
    expect(stateOf(bucket, a, when(5)).drawnThisCycle).toBe(true);
  });

  it("a cycle reset clears every item's turn", () => {
    const { bucket, ids } = setup();
    const [a = "", b = ""] = ids;
    bucket.events.push(event("drawn", a, 1), event("done", a, 2), event("cycle-reset", "", 3));
    const now = when(4);
    expect(stateOf(bucket, a, now).drawnThisCycle).toBe(false);
    expect(stateOf(bucket, b, now).drawnThisCycle).toBe(false);
    expect(stateOf(bucket, a, now).timesDrawn).toBe(1);
  });

  it("ignores history for items that no longer exist", () => {
    const { bucket, ids } = setup(1);
    bucket.events.push(event("drawn", "ghost", 1), event("done", "ghost", 2));
    expect(deriveItems(bucket, when(3))).toHaveLength(ids.length);
    expect(deriveItems(bucket, when(3))[0]?.status).toBe("in");
  });

  it("lets the earliest of two concurrent draws of one item win", () => {
    const { bucket, ids } = setup();
    const [a = ""] = ids;
    bucket.events.push(
      event("drawn", a, 1.5, { memberId: "you", deviceId: "d2" }),
      event("drawn", a, 1, { memberId: "me", deviceId: "d1" }),
    );
    expect(stateOf(bucket, a, when(2))).toMatchObject({ heldBy: "me", timesDrawn: 1 });
  });

  it("ignores a repeated finish or toss-back, and one for an item not in hand", () => {
    const { bucket, ids } = setup();
    const [a = "", b = ""] = ids;
    bucket.events.push(
      event("drawn", a, 1),
      event("done", a, 2),
      event("done", a, 2.5),
      event("tossed-back", a, 2.6),
      event("done", b, 3),
    );
    expect(stateOf(bucket, a, when(4)).timesDone).toBe(1);
    expect(stateOf(bucket, b, when(4))).toMatchObject({ status: "in", timesDone: 0 });
  });

  it("breaks ties between events at the same instant by id", () => {
    const { bucket, ids } = setup();
    const [a = ""] = ids;
    const draw = { ...event("drawn", a, 1), id: "b" };
    const done = { ...event("done", a, 1), id: "a" };
    // "a" sorts first, so the finish arrives before the draw and is ignored.
    bucket.events.push(draw, done);
    expect(stateOf(bucket, a, when(2)).status).toBe("hand");
  });

  it("gives the same answer whatever order events arrive in", () => {
    const { bucket, ids } = setup(3);
    const [a = "", b = "", c = ""] = ids;
    const events = [
      event("drawn", a, 1),
      event("done", a, 2, { cooldown: duration(3, "hours") }),
      event("drawn", b, 3),
      event("tossed-back", b, 4),
      event("drawn", c, 5),
      event("cycle-reset", "", 6),
      event("drawn", a, 7),
    ];
    bucket.events = events;
    const expected = deriveItems(bucket, when(8));
    const rng = createSeededRng(123);
    for (let round = 0; round < 50; round++) {
      const shuffled = [...events];
      for (let i = shuffled.length - 1; i > 0; i--) {
        const j = randomInt(rng, i + 1);
        [shuffled[i], shuffled[j]] = [shuffled[j] as DrawEvent, shuffled[i] as DrawEvent];
      }
      bucket.events = shuffled;
      expect(deriveItems(bucket, when(8))).toEqual(expected);
    }
  });

  it("counts finished steps", () => {
    const { bucket, ids } = setup();
    const [a = ""] = ids;
    let n = 100;
    const ctx: CommandContext = {
      memberId: "me",
      now: new Date(T0),
      makeId: () => `s${String(++n)}`,
    };
    const s1 = addStep(bucket, a, "one", ctx);
    addStep(bucket, a, "two", ctx);
    if (s1.ok) setStepDone(bucket, a, s1.value, true, ctx);
    expect(stateOf(bucket, a, when(0)).stepsProgress).toEqual({ done: 1, total: 2 });
  });

  it("does not change the bucket", () => {
    const { bucket, ids } = setup();
    bucket.events.push(event("drawn", ids[0] ?? "", 2), event("drawn", ids[1] ?? "", 1));
    const before = JSON.stringify(bucket);
    deriveItems(bucket, when(3));
    expect(JSON.stringify(bucket)).toBe(before);
  });
});

describe("sortEvents", () => {
  it("returns a new array ordered by time then id", () => {
    const e1 = { ...event("drawn", "i", 2), id: "z" };
    const e2 = { ...event("drawn", "i", 1), id: "y" };
    const e3 = { ...event("drawn", "i", 1), id: "x" };
    const input = [e1, e2, e3];
    expect(sortEvents(input).map((e) => e.id)).toEqual(["x", "y", "z"]);
    expect(input[0]).toBe(e1);
  });
});

describe("isStale", () => {
  const rules = {
    ...createBucket(
      { name: "B", ownerName: "Me" },
      { memberId: "me", now: new Date(T0), makeId: () => "b" },
    ).rules,
  };

  it("is stale once cycleResetAfter has passed since the item was finished", () => {
    const { bucket, ids } = setup();
    const [a = ""] = ids;
    bucket.events.push(event("drawn", a, 0), event("done", a, 1));
    const state = stateOf(bucket, a, when(2));
    const withReset = { ...rules, cycleResetAfter: duration(2, "hours") };
    expect(isStale(state, withReset, when(2.99))).toBe(false);
    expect(isStale(state, withReset, when(3))).toBe(true);
  });

  it("is never stale without the rule or without a finish", () => {
    const { bucket, ids } = setup();
    const [a = ""] = ids;
    const fresh = stateOf(bucket, a, when(0));
    expect(isStale(fresh, { ...rules, cycleResetAfter: duration(1, "hours") }, when(99))).toBe(
      false,
    );
    bucket.events.push(event("drawn", a, 0), event("done", a, 1));
    expect(isStale(stateOf(bucket, a, when(2)), rules, when(999))).toBe(false);
  });
});

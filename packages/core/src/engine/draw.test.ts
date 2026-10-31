// SPDX-License-Identifier: Apache-2.0

import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { chiSquare, chiSquareCritical, countBy } from "../../test/stats";
import { DAY, HOUR, T0, applyOk, idMaker, makeBucket, request } from "../../test/builders";
import { duration } from "../duration";
import { createSeededRng } from "../random/rng";
import { deriveItems } from "./derive";
import {
  FAVOR_UNDRAWN_FACTOR,
  checkDraw,
  draw,
  recordDraw,
  weightOf,
  weightedSample,
} from "./draw";
import { resolve } from "./resolve";

/** Draws once and finishes the item an hour later; returns the id drawn. */
function drawAndFinish(
  bucket: ReturnType<typeof makeBucket>,
  rng: ReturnType<typeof createSeededRng>,
  makeId: () => string,
  nowMs: number,
): string {
  const [id = ""] = applyOk(bucket, draw(bucket, request(rng, nowMs, makeId)));
  applyOk(
    bucket,
    resolve(bucket, {
      itemId: id,
      kind: "done",
      memberId: "me",
      deviceId: "d1",
      now: new Date(nowMs + HOUR / 2),
      makeId,
    }),
  );
  return id;
}

describe("Grab & Go", () => {
  it("locks until the drawn item is finished, then removes it", () => {
    const bucket = makeBucket({ items: 3 });
    const rng = createSeededRng(1);
    const makeId = idMaker("e");
    const [first = ""] = applyOk(bucket, draw(bucket, request(rng, T0, makeId)));

    const locked = checkDraw(bucket, "me", new Date(T0 + HOUR));
    expect(locked).toMatchObject({ ok: false, reason: "locked" });
    expect(locked.ok ? [] : "holding" in locked ? locked.holding.map((i) => i.id) : []).toEqual([
      first,
    ]);

    applyOk(
      bucket,
      resolve(bucket, {
        itemId: first,
        kind: "done",
        memberId: "me",
        deviceId: "d1",
        now: new Date(T0 + HOUR),
        makeId,
      }),
    );
    expect(
      deriveItems(bucket, new Date(T0 + 2 * HOUR)).find((s) => s.item.id === first)?.status,
    ).toBe("done");

    const seen = new Set([first]);
    for (let i = 1; i <= 2; i++) seen.add(drawAndFinish(bucket, rng, makeId, T0 + i * 2 * HOUR));
    expect(seen.size).toBe(3);
    expect(draw(bucket, request(rng, T0 + 10 * HOUR, makeId))).toEqual({
      ok: false,
      reason: "empty",
      doneCount: 3,
    });
  });

  it("tossing back unlocks the bucket and returns the item unfinished", () => {
    const bucket = makeBucket({ items: 2 });
    const rng = createSeededRng(2);
    const makeId = idMaker("e");
    const [id = ""] = applyOk(bucket, draw(bucket, request(rng, T0, makeId)));
    applyOk(
      bucket,
      resolve(bucket, {
        itemId: id,
        kind: "tossed-back",
        memberId: "me",
        deviceId: "d1",
        now: new Date(T0 + HOUR),
        makeId,
        note: "not today",
      }),
    );
    expect(bucket.events.at(-1)?.note).toBe("not today");
    expect(deriveItems(bucket, new Date(T0 + 2 * HOUR)).find((s) => s.item.id === id)?.status).toBe(
      "in",
    );
    expect(checkDraw(bucket, "me", new Date(T0 + 2 * HOUR)).ok).toBe(true);
  });
});

describe("Rotation Pool: the 10-systems example from plan.md §6.2", () => {
  it("offers only unfinished systems, lets old ones rejoin after 30 days, and favors untouched ones", () => {
    const bucket = makeBucket({ preset: "rotation-pool", items: 10, rules: { maxInHand: 1 } });
    const rng = createSeededRng(7);
    const makeId = idMaker("e");

    const finished = new Set<string>();
    for (let step = 0; step < 6; step++) {
      const id = drawAndFinish(bucket, rng, makeId, T0 + step * 2 * HOUR);
      expect(finished.has(id)).toBe(false);
      finished.add(id);
    }

    const afterSix = new Date(T0 + 12 * HOUR);
    const pool = checkDraw(bucket, "me", afterSix);
    if (!pool.ok) throw new Error("expected a pool");
    expect(pool.candidates).toHaveLength(4);
    expect(pool.candidates.some((c) => finished.has(c.item.id))).toBe(false);

    const later = new Date(T0 + 31 * DAY);
    const rejoined = checkDraw(bucket, "me", later);
    if (!rejoined.ok) throw new Error("expected a pool");
    expect(rejoined.candidates).toHaveLength(10);

    const statsRng = createSeededRng(99);
    const counts = countBy(
      Array.from({ length: 30_000 }, () => {
        const result = draw(bucket, request(statsRng, later.getTime(), makeId));
        if (!result.ok) throw new Error("draw failed");
        return result.itemIds[0] ?? "";
      }),
    );
    const mean = (ids: string[]): number =>
      ids.reduce((sum, id) => sum + (counts.get(id) ?? 0), 0) / ids.length;
    const untouched = Object.keys(bucket.items).filter((id) => !finished.has(id));
    const ratio = mean(untouched) / mean([...finished]);
    expect(Math.abs(ratio - FAVOR_UNDRAWN_FACTOR)).toBeLessThan(0.25);
  });

  it("starts a new round once every item has had a turn", () => {
    const bucket = makeBucket({ preset: "rotation-pool", items: 3, rules: { maxInHand: 1 } });
    delete bucket.rules.cycleResetAfter;
    const rng = createSeededRng(3);
    const makeId = idMaker("e");
    const seen = new Set<string>();
    for (let i = 0; i < 3; i++) {
      const result = draw(bucket, request(rng, T0 + i * 2 * HOUR, makeId));
      if (!result.ok) throw new Error("draw failed");
      expect(result.cycleReset).toBe(false);
      seen.add(result.itemIds[0] ?? "");
      applyOk(bucket, result);
      applyOk(
        bucket,
        resolve(bucket, {
          itemId: result.itemIds[0] ?? "",
          kind: "done",
          memberId: "me",
          deviceId: "d1",
          now: new Date(T0 + i * 2 * HOUR + HOUR),
          makeId,
        }),
      );
    }
    expect(seen.size).toBe(3);
    const fourth = draw(bucket, request(rng, T0 + 8 * HOUR, makeId));
    if (!fourth.ok) throw new Error("draw failed");
    expect(fourth.cycleReset).toBe(true);
    expect(fourth.events[0]?.kind).toBe("cycle-reset");
  });

  it("can draw several items in one go without repeating within a cycle", () => {
    const bucket = makeBucket({
      preset: "rotation-pool",
      items: 4,
      rules: { drawCount: 2, maxInHand: 2 },
    });
    const rng = createSeededRng(5);
    const makeId = idMaker("e");
    const first = applyOk(bucket, draw(bucket, request(rng, T0, makeId)));
    for (const id of first)
      applyOk(
        bucket,
        resolve(bucket, {
          itemId: id,
          kind: "done",
          memberId: "me",
          deviceId: "d1",
          now: new Date(T0 + HOUR),
          makeId,
        }),
      );
    const second = applyOk(bucket, draw(bucket, request(rng, T0 + 2 * HOUR, makeId)));
    expect(new Set([...first, ...second]).size).toBe(4);
  });

  it("a removal followed by a cycle reset keeps the removed item out", () => {
    const bucket = makeBucket({
      preset: "rotation-pool",
      items: 2,
      rules: { maxInHand: 1, onDone: "remove" },
    });
    delete bucket.rules.cycleResetAfter;
    const rng = createSeededRng(6);
    const makeId = idMaker("e");
    const first = drawAndFinish(bucket, rng, makeId, T0);
    const second = applyOk(bucket, draw(bucket, request(rng, T0 + 2 * HOUR, makeId)));
    expect(second).not.toContain(first);
  });
});

describe("tossing back", () => {
  it.each([
    { countsAsDrawn: false, candidate: true },
    { countsAsDrawn: true, candidate: false },
  ])(
    "with tossBackCountsAsDrawn=$countsAsDrawn the item is a candidate again: $candidate",
    ({ countsAsDrawn, candidate }) => {
      const bucket = makeBucket({
        preset: "rotation-pool",
        items: 3,
        rules: { maxInHand: 1, tossBackCountsAsDrawn: countsAsDrawn },
      });
      const rng = createSeededRng(4);
      const makeId = idMaker("e");
      const [id = ""] = applyOk(bucket, draw(bucket, request(rng, T0, makeId)));
      applyOk(
        bucket,
        resolve(bucket, {
          itemId: id,
          kind: "tossed-back",
          memberId: "me",
          deviceId: "d1",
          now: new Date(T0 + HOUR),
          makeId,
        }),
      );
      const check = checkDraw(bucket, "me", new Date(T0 + 2 * HOUR));
      if (!check.ok) throw new Error("expected a pool");
      expect(check.candidates.some((c) => c.item.id === id)).toBe(candidate);
    },
  );
});

describe("Mystery Bag", () => {
  it("rests an item for 24 hours after it is finished, and reopens exactly then", () => {
    const bucket = makeBucket({ preset: "mystery-bag", items: 1 });
    const rng = createSeededRng(8);
    const makeId = idMaker("e");
    const [id = ""] = applyOk(bucket, draw(bucket, request(rng, T0, makeId)));
    applyOk(
      bucket,
      resolve(bucket, {
        itemId: id,
        kind: "done",
        memberId: "me",
        deviceId: "d1",
        now: new Date(T0),
        makeId,
      }),
    );
    expect(checkDraw(bucket, "me", new Date(T0 + HOUR))).toEqual({
      ok: false,
      reason: "all-cooling-down",
      opensAt: new Date(T0 + 24 * HOUR).toISOString(),
    });
    expect(checkDraw(bucket, "me", new Date(T0 + 24 * HOUR - 1)).ok).toBe(false);
    expect(checkDraw(bucket, "me", new Date(T0 + 24 * HOUR)).ok).toBe(true);
  });

  it("reports the earliest reopening when several items are resting", () => {
    const bucket = makeBucket({
      preset: "mystery-bag",
      items: 2,
      rules: { cooldown: duration(2, "hours") },
    });
    const rng = createSeededRng(9);
    const makeId = idMaker("e");
    drawAndFinish(bucket, rng, makeId, T0);
    drawAndFinish(bucket, rng, makeId, T0 + HOUR);
    // The first item was finished at T0 + 30 min and rests 2 h; the second rests until T0 + 3 h 30 min.
    const result = checkDraw(bucket, "me", new Date(T0 + 2 * HOUR));
    expect(result).toEqual({
      ok: false,
      reason: "all-cooling-down",
      opensAt: new Date(T0 + 2.5 * HOUR).toISOString(),
    });
  });

  it("still offers items that are not resting while others cool down", () => {
    const bucket = makeBucket({ preset: "mystery-bag", items: 2 });
    const rng = createSeededRng(10);
    const makeId = idMaker("e");
    const first = drawAndFinish(bucket, rng, makeId, T0);
    const check = checkDraw(bucket, "me", new Date(T0 + 2 * HOUR));
    if (!check.ok) throw new Error("expected a pool");
    expect(check.candidates.map((c) => c.item.id)).not.toContain(first);
    expect(check.candidates).toHaveLength(1);
  });
});

describe("limits", () => {
  it("caps a draw by the room left in hand", () => {
    const bucket = makeBucket({
      preset: "weighted",
      items: [1, 1, 1, 1],
      rules: { maxInHand: 3, drawCount: 2 },
    });
    const rng = createSeededRng(11);
    const makeId = idMaker("e");
    expect(applyOk(bucket, draw(bucket, request(rng, T0, makeId)))).toHaveLength(2);
    expect(applyOk(bucket, draw(bucket, request(rng, T0 + HOUR, makeId)))).toHaveLength(1);
    expect(draw(bucket, request(rng, T0 + 2 * HOUR, makeId))).toMatchObject({
      ok: false,
      reason: "hand-full",
    });
  });

  it("counts a hand per member when the scope is per-member", () => {
    const bucket = makeBucket({ preset: "round-robin", items: 4, members: { you: "drawer" } });
    const rng = createSeededRng(12);
    const makeId = idMaker("e");
    applyOk(bucket, draw(bucket, request(rng, T0, makeId, "me")));
    expect(draw(bucket, request(rng, T0, makeId, "me"))).toMatchObject({
      ok: false,
      reason: "hand-full",
    });
    expect(draw(bucket, request(rng, T0, makeId, "you")).ok).toBe(true);
  });

  it("applies a lock per member when the scope is per-member", () => {
    const bucket = makeBucket({
      preset: "round-robin",
      items: 4,
      rules: { lockUntilResolved: true },
      members: { you: "drawer" },
    });
    const rng = createSeededRng(13);
    const makeId = idMaker("e");
    applyOk(bucket, draw(bucket, request(rng, T0, makeId, "me")));
    expect(draw(bucket, request(rng, T0, makeId, "me"))).toMatchObject({
      ok: false,
      reason: "locked",
    });
    expect(draw(bucket, request(rng, T0, makeId, "you")).ok).toBe(true);
  });

  it("refuses viewers and strangers", () => {
    const bucket = makeBucket({ members: { watcher: "viewer" } });
    const rng = createSeededRng(14);
    const makeId = idMaker("e");
    expect(draw(bucket, request(rng, T0, makeId, "watcher"))).toEqual({
      ok: false,
      reason: "not-permitted",
    });
    expect(draw(bucket, request(rng, T0, makeId, "stranger"))).toEqual({
      ok: false,
      reason: "not-permitted",
    });
  });

  it("is empty when every item is archived", () => {
    const bucket = makeBucket({ items: 2 });
    for (const item of Object.values(bucket.items)) item.archived = true;
    expect(checkDraw(bucket, "me", new Date(T0))).toEqual({
      ok: false,
      reason: "empty",
      doneCount: 0,
    });
  });

  it("is empty when every item is in someone else's hand", () => {
    const bucket = makeBucket({ preset: "round-robin", items: 1, members: { you: "drawer" } });
    const rng = createSeededRng(15);
    const makeId = idMaker("e");
    applyOk(bucket, draw(bucket, request(rng, T0, makeId, "you")));
    expect(draw(bucket, request(rng, T0, makeId, "me"))).toEqual({
      ok: false,
      reason: "empty",
      doneCount: 0,
    });
  });

  it("ignores history for items that were removed", () => {
    const bucket = makeBucket({ items: 1 });
    bucket.events.push(
      recordDraw("ghost", {
        memberId: "me",
        deviceId: "d1",
        now: new Date(T0),
        makeId: idMaker("g"),
      }),
    );
    expect(checkDraw(bucket, "me", new Date(T0 + HOUR)).ok).toBe(true);
  });
});

describe("selection", () => {
  it("draws uniformly (chi-square, 4 items, 100k seeded draws)", () => {
    const bucket = makeBucket({ preset: "weighted", items: 4, rules: { selection: "uniform" } });
    const rng = createSeededRng(21);
    const makeId = idMaker("e");
    const counts = countBy(
      Array.from({ length: 100_000 }, () => {
        const result = draw(bucket, request(rng, T0, makeId));
        return result.ok ? (result.itemIds[0] ?? "") : "";
      }),
    );
    const observed = ["i0", "i1", "i2", "i3"].map((id) => counts.get(id) ?? 0);
    expect(chiSquare(observed, [25_000, 25_000, 25_000, 25_000])).toBeLessThan(
      chiSquareCritical(3),
    );
  });

  it("follows item weights", () => {
    const bucket = makeBucket({ preset: "weighted", items: [3, 1] });
    const rng = createSeededRng(22);
    const makeId = idMaker("e");
    let heavy = 0;
    const draws = 100_000;
    for (let i = 0; i < draws; i++) {
      const result = draw(bucket, request(rng, T0, makeId));
      if (result.ok && result.itemIds[0] === "i0") heavy++;
    }
    expect(Math.abs(heavy / draws - 0.75)).toBeLessThan(0.01);
  });

  it("never draws a weight-0 item, and falls back to chance when every weight is 0", () => {
    const rng = createSeededRng(23);
    const makeId = idMaker("e");
    const some = makeBucket({ preset: "weighted", items: [0, 1, 1] });
    for (let i = 0; i < 500; i++) {
      const result = draw(some, request(rng, T0, makeId));
      expect(result.ok && result.itemIds[0]).not.toBe("i0");
    }
    const none = makeBucket({ preset: "weighted", items: [0, 0] });
    expect(draw(none, request(rng, T0, makeId)).ok).toBe(true);
  });

  it("Simmer favors items that have waited longer", () => {
    const bucket = makeBucket({ preset: "simmer", items: 2 });
    const fresh = bucket.items["i1"];
    if (fresh) fresh.createdAt = new Date(T0).toISOString();
    const old = bucket.items["i0"];
    if (old) old.createdAt = new Date(T0 - 60 * DAY).toISOString();
    const rng = createSeededRng(24);
    const makeId = idMaker("e");
    let oldWins = 0;
    for (let i = 0; i < 10_000; i++) {
      const result = draw(bucket, request(rng, T0, makeId));
      if (result.ok && result.itemIds[0] === "i0") oldWins++;
    }
    expect(oldWins / 10_000).toBeGreaterThan(0.95);
  });

  it("Simmer measures waiting from the last draw, and multiplies the item's own weight", () => {
    const bucket = makeBucket({ preset: "simmer", items: [2, 1] });
    const rng = createSeededRng(25);
    const makeId = idMaker("e");
    bucket.events.push(
      recordDraw("i0", { memberId: "me", deviceId: "d1", now: new Date(T0 - 2 * DAY), makeId }),
    );
    bucket.events.push({
      ...recordDraw("i0", {
        memberId: "me",
        deviceId: "d1",
        now: new Date(T0 - 2 * DAY + HOUR),
        makeId,
      }),
      kind: "tossed-back",
      countsAsDrawn: true,
    });
    const states = deriveItems(bucket, new Date(T0));
    const [a, b] = states;
    if (!a || !b) throw new Error("missing states");
    // i0: weight 2 × (1 + 0.5 × ~2 days); i1: weight 1 × (1 + 0.5 × 30 days).
    expect(weightOf(a, bucket, new Date(T0), false)).toBeCloseTo(2 * (1 + 0.5 * 2), 5);
    expect(weightOf(b, bucket, new Date(T0), false)).toBeCloseTo(1 + 0.5 * 30, 5);
    expect(draw(bucket, request(rng, T0, makeId)).ok).toBe(true);
  });

  it("favorUndrawn boosts only items that have not had a turn, and only before a reset", () => {
    const bucket = makeBucket({ preset: "rotation-pool", items: 2 });
    bucket.events.push(
      recordDraw("i0", {
        memberId: "me",
        deviceId: "d1",
        now: new Date(T0 - HOUR),
        makeId: idMaker("f"),
      }),
    );
    bucket.events.push({
      ...recordDraw("i0", {
        memberId: "me",
        deviceId: "d1",
        now: new Date(T0 - HOUR / 2),
        makeId: idMaker("g"),
      }),
      kind: "done",
    });
    const [a, b] = deriveItems(bucket, new Date(T0));
    if (!a || !b) throw new Error("missing states");
    expect(weightOf(a, bucket, new Date(T0), false)).toBe(1);
    expect(weightOf(b, bucket, new Date(T0), false)).toBe(FAVOR_UNDRAWN_FACTOR);
    expect(weightOf(b, bucket, new Date(T0), true)).toBe(1);
  });

  it("Round Robin gives never-drawn items first, then whoever waited longest", () => {
    const bucket = makeBucket({ preset: "round-robin", items: 3, rules: { maxInHand: 1 } });
    const rng = createSeededRng(26);
    const makeId = idMaker("e");
    const order = [0, 1, 2, 3].map((i) => drawAndFinish(bucket, rng, makeId, T0 + i * 2 * HOUR));
    expect(order).toEqual(["i0", "i1", "i2", "i0"]);
  });

  it("weightedSample chooses distinct entries and never a non-positive weight", () => {
    const rng = createSeededRng(27);
    const entries = [
      { weight: 1 },
      { weight: 2 },
      { weight: 0 },
      { weight: Number.NaN },
      { weight: 3 },
    ];
    for (let i = 0; i < 200; i++) {
      const picked = weightedSample(entries, 5, rng);
      expect(new Set(picked).size).toBe(picked.length);
      expect(picked).toHaveLength(3);
      expect(picked.every((e) => e.weight > 0)).toBe(true);
    }
  });
});

describe("properties", () => {
  it("draw never mutates its input", () => {
    const bucket = makeBucket({ preset: "rotation-pool", items: 5 });
    const before = JSON.stringify(bucket);
    draw(bucket, request(createSeededRng(30), T0, idMaker("e")));
    expect(JSON.stringify(bucket)).toBe(before);
  });

  it("never exceeds maxInHand, never draws an ineligible item, and always terminates", () => {
    const rulesArb = fc.record({
      drawCount: fc.integer({ min: 1, max: 3 }),
      maxInHand: fc.integer({ min: 1, max: 4 }),
      inHandScope: fc.constantFrom("bucket" as const, "per-member" as const),
      lockUntilResolved: fc.boolean(),
      onDone: fc.constantFrom("remove" as const, "return" as const),
      noRepeat: fc.constantFrom("off" as const, "until-cycle-complete" as const),
      favorUndrawn: fc.boolean(),
      tossBackCountsAsDrawn: fc.boolean(),
      selection: fc.constantFrom(
        "uniform" as const,
        "weighted" as const,
        "aging" as const,
        "round-robin" as const,
      ),
      agingRatePerDay: fc.double({ min: 0, max: 2, noNaN: true }),
    });
    const stepArb = fc.record({
      op: fc.constantFrom("draw", "done", "toss", "wait"),
      who: fc.constantFrom("me", "you"),
      pick: fc.nat(),
      hours: fc.integer({ min: 1, max: 48 }),
    });
    fc.assert(
      fc.property(
        rulesArb,
        fc.integer({ min: 1, max: 6 }),
        fc.integer({ min: 0, max: 3 }),
        fc.array(stepArb, { maxLength: 40 }),
        fc.integer(),
        (rules, itemCount, cooldownHours, steps, seed) => {
          const bucket = makeBucket({
            preset: "rotation-pool",
            items: itemCount,
            members: { you: "drawer" },
            rules: {
              ...rules,
              ...(cooldownHours > 0 ? { cooldown: duration(cooldownHours, "hours") } : {}),
            },
          });
          const rng = createSeededRng(seed);
          const makeId = idMaker("e");
          let now = T0;
          for (const step of steps) {
            now += step.hours * HOUR;
            const at = new Date(now);
            if (step.op === "draw") {
              const before = deriveItems(bucket, at);
              const result = draw(bucket, request(rng, now, makeId, step.who));
              if (!result.ok) continue;
              for (const id of result.itemIds) {
                const state = before.find((s) => s.item.id === id);
                expect(state?.status).toBe("in");
                expect(state?.item.archived).toBe(false);
              }
              expect(new Set(result.itemIds).size).toBe(result.itemIds.length);
              applyOk(bucket, result);
            } else if (step.op !== "wait") {
              const held = deriveItems(bucket, at).filter(
                (s) => s.status === "hand" && s.heldBy === step.who,
              );
              const target = held[step.pick % Math.max(held.length, 1)];
              if (target) {
                const kind = step.op === "done" ? "done" : "tossed-back";
                applyOk(
                  bucket,
                  resolve(bucket, {
                    itemId: target.item.id,
                    kind,
                    memberId: step.who,
                    deviceId: "d1",
                    now: at,
                    makeId,
                  }),
                );
              }
            }
            const holding = deriveItems(bucket, at).filter((s) => s.status === "hand");
            if (rules.inHandScope === "bucket") {
              expect(holding.length).toBeLessThanOrEqual(rules.maxInHand);
            } else {
              for (const who of ["me", "you"]) {
                expect(holding.filter((s) => s.heldBy === who).length).toBeLessThanOrEqual(
                  rules.maxInHand,
                );
              }
            }
          }
        },
      ),
      { numRuns: 150 },
    );
  });
});

// SPDX-License-Identifier: Apache-2.0

import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { DAY, HOUR, T0, applyOk, idMaker, makeBucket, request } from "../../test/builders";
import { duration } from "../duration";
import type { Bucket } from "../model/types";
import { createSeededRng } from "../random/rng";
import { DEFAULT_COMPACTION_HORIZON, compactHistory, compactionCutoff } from "./compact";
import { deriveItems } from "./derive";
import { draw } from "./draw";
import { resolve } from "./resolve";

const clone = (bucket: Bucket): Bucket => JSON.parse(JSON.stringify(bucket)) as Bucket;

/** Runs draw/finish/toss-back steps spread over many months, returning the final time. */
function simulate(
  bucket: Bucket,
  seed: number,
  steps: { op: "draw" | "done" | "toss"; gapDays: number }[],
): number {
  const rng = createSeededRng(seed);
  const makeId = idMaker("e");
  let now = T0;
  for (const step of steps) {
    now += step.gapDays * DAY + HOUR;
    if (step.op === "draw") {
      const result = draw(bucket, request(rng, now, makeId));
      if (result.ok) applyOk(bucket, result);
      continue;
    }
    const held = deriveItems(bucket, new Date(now)).find((s) => s.status === "hand");
    if (!held) continue;
    const kind = step.op === "done" ? "done" : "tossed-back";
    applyOk(
      bucket,
      resolve(bucket, {
        itemId: held.item.id,
        kind,
        memberId: "me",
        deviceId: "d1",
        now: new Date(now),
        makeId,
      }),
    );
  }
  return now;
}

describe("compactionCutoff", () => {
  it("is the start of the UTC month that contains now minus the horizon", () => {
    expect(compactionCutoff(new Date("2026-10-30T12:00:00Z")).toISOString()).toBe(
      "2025-10-01T00:00:00.000Z",
    );
    expect(
      compactionCutoff(new Date("2026-10-30T12:00:00Z"), duration(90, "days")).toISOString(),
    ).toBe("2026-08-01T00:00:00.000Z");
  });

  it("gives devices that compact on different days of a month the same boundary", () => {
    const a = compactionCutoff(new Date("2026-10-03T00:00:00Z"));
    const b = compactionCutoff(new Date("2026-10-29T23:59:59Z"));
    expect(a.toISOString()).toBe(b.toISOString());
  });

  it("defaults to a year", () => {
    expect(DEFAULT_COMPACTION_HORIZON).toEqual(duration(365, "days"));
  });
});

describe("compactHistory", () => {
  const build = (): { bucket: Bucket; now: number } => {
    const bucket = makeBucket({
      preset: "rotation-pool",
      items: 3,
      rules: { maxInHand: 1, cooldown: duration(2, "hours") },
    });
    const now = simulate(bucket, 5, [
      { op: "draw", gapDays: 0 },
      { op: "done", gapDays: 1 },
      { op: "draw", gapDays: 40 },
      { op: "toss", gapDays: 1 },
      { op: "draw", gapDays: 40 },
      { op: "done", gapDays: 1 },
      { op: "draw", gapDays: 100 },
    ]);
    return { bucket, now };
  };

  it("removes old events, keeps recent ones, and leaves derived state unchanged", () => {
    const { bucket, now } = build();
    const before = deriveItems(bucket, new Date(now));
    const total = bucket.events.length;
    const removed = compactHistory(bucket, new Date(now), duration(90, "days"));
    expect(removed).toBeGreaterThan(0);
    expect(bucket.events).toHaveLength(total - removed);
    expect(bucket.baseline?.through).toBe(
      compactionCutoff(new Date(now), duration(90, "days")).toISOString(),
    );
    expect(
      bucket.events.every((e) => Date.parse(e.at) >= Date.parse(bucket.baseline?.through ?? "")),
    ).toBe(true);
    expect(deriveItems(bucket, new Date(now))).toEqual(before);
  });

  it("keeps a held item held, so a later finish still lands", () => {
    const bucket = makeBucket({ items: 2 });
    const makeId = idMaker("e");
    const rng = createSeededRng(1);
    const [id = ""] = applyOk(bucket, draw(bucket, request(rng, T0, makeId)));
    const later = T0 + 300 * DAY;
    expect(compactHistory(bucket, new Date(later), duration(30, "days"))).toBe(1);
    expect(bucket.events).toEqual([]);
    expect(deriveItems(bucket, new Date(later)).find((s) => s.item.id === id)).toMatchObject({
      status: "hand",
      heldBy: "me",
      timesDrawn: 1,
    });
    applyOk(
      bucket,
      resolve(bucket, {
        itemId: id,
        kind: "done",
        memberId: "me",
        deviceId: "d1",
        now: new Date(later),
        makeId,
      }),
    );
    expect(deriveItems(bucket, new Date(later)).find((s) => s.item.id === id)).toMatchObject({
      status: "done",
      timesDone: 1,
      timesDrawn: 1,
    });
  });

  it("does nothing when there is nothing old, and does not repeat itself", () => {
    const { bucket, now } = build();
    expect(compactHistory(bucket, new Date(now), duration(3650, "days"))).toBe(0);
    expect(bucket.baseline).toBeUndefined();
    compactHistory(bucket, new Date(now), duration(90, "days"));
    const snapshot = JSON.stringify(bucket);
    expect(compactHistory(bucket, new Date(now), duration(90, "days"))).toBe(0);
    expect(compactHistory(bucket, new Date(now + 2 * DAY), duration(90, "days"))).toBe(0);
    expect(JSON.stringify(bucket)).toBe(snapshot);
  });

  it("builds on an earlier baseline when compacted again later", () => {
    const { bucket, now } = build();
    const original = clone(bucket);
    compactHistory(bucket, new Date(now), duration(150, "days"));
    const first = bucket.baseline?.through ?? "";
    compactHistory(bucket, new Date(now), duration(60, "days"));
    expect(Date.parse(bucket.baseline?.through ?? "")).toBeGreaterThan(Date.parse(first));
    expect(deriveItems(bucket, new Date(now))).toEqual(deriveItems(original, new Date(now)));
  });

  it("gives identical results on every device", () => {
    const { bucket, now } = build();
    const other = clone(bucket);
    compactHistory(bucket, new Date(now), duration(90, "days"));
    compactHistory(other, new Date(now + 5 * DAY), duration(90, "days"));
    expect(other).toEqual(bucket);
  });

  it("ignores baseline entries for items that have since been removed", () => {
    const { bucket, now } = build();
    compactHistory(bucket, new Date(now), duration(90, "days"));
    delete bucket.items["i0"];
    bucket.itemOrder = bucket.itemOrder.filter((id) => id !== "i0");
    expect(deriveItems(bucket, new Date(now)).map((s) => s.item.id)).toEqual(["i1", "i2"]);
  });

  it("keeps automatic returns identical across a compaction", () => {
    const bucket = makeBucket({ preset: "daily-draw", items: 4 });
    bucket.timeZone = "America/New_York";
    const end = simulate(
      bucket,
      11,
      Array.from({ length: 30 }, (_, i) => ({
        op: i % 3 === 2 ? ("done" as const) : ("draw" as const),
        gapDays: 3,
      })),
    );
    const original = clone(bucket);
    expect(compactHistory(bucket, new Date(end), duration(30, "days"))).toBeGreaterThan(0);
    for (const probe of [end, end + HOUR * 20, end + 10 * DAY]) {
      expect(deriveItems(bucket, new Date(probe))).toEqual(deriveItems(original, new Date(probe)));
    }
  });

  it("derives the same state before and after compaction for any history", () => {
    fc.assert(
      fc.property(
        fc.array(
          fc.record({
            op: fc.constantFrom("draw" as const, "done" as const, "toss" as const),
            gapDays: fc.integer({ min: 0, max: 45 }),
          }),
          { maxLength: 40 },
        ),
        fc.integer(),
        fc.constantFrom(30, 90, 200),
        fc.constantFrom(
          "rotation-pool" as const,
          "mystery-bag" as const,
          "grab-and-go" as const,
          "daily-draw" as const,
        ),
        (steps, seed, horizonDays, preset) => {
          const bucket = makeBucket({ preset, items: 4, rules: { maxInHand: 2, drawCount: 1 } });
          const end = simulate(bucket, seed, steps);
          const original = clone(bucket);
          const horizon = duration(horizonDays, "days");
          compactHistory(bucket, new Date(end), horizon);
          for (const probe of [end, end + 3 * DAY, end + 400 * DAY]) {
            expect(deriveItems(bucket, new Date(probe))).toEqual(
              deriveItems(original, new Date(probe)),
            );
          }
          // Compacting a second time at a later date must still agree with the untouched history.
          compactHistory(bucket, new Date(end + 200 * DAY), horizon);
          expect(deriveItems(bucket, new Date(end + 400 * DAY))).toEqual(
            deriveItems(original, new Date(end + 400 * DAY)),
          );
        },
      ),
      { numRuns: 100 },
    );
  });
});

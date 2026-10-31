// SPDX-License-Identifier: Apache-2.0

import { describe, expect, it } from "vitest";
import { HOUR, applyOk, idMaker, makeBucket, request } from "../../test/builders";
import type { Bucket } from "../model/types";
import { createSeededRng } from "../random/rng";
import { autoReturnOf, deriveItems } from "./derive";
import { checkDraw, draw } from "./draw";
import { resolve } from "./resolve";

const utc = (iso: string): number => Date.parse(iso);

/** A Daily Draw bucket in New York: items go back at local midnight (04:00Z during daylight time). */
function dailyDraw(items = 3, rules: Partial<Bucket["rules"]> = {}): Bucket {
  const bucket = makeBucket({ preset: "daily-draw", items, rules });
  bucket.timeZone = "America/New_York";
  return bucket;
}

const statusOf = (bucket: Bucket, id: string, ms: number): string | undefined =>
  deriveItems(bucket, new Date(ms)).find((s) => s.item.id === id)?.status;

describe("automatic return (Daily Draw)", () => {
  const morning = utc("2026-10-12T13:00:00Z"); // 09:00 in New York
  const midnight = utc("2026-10-13T04:00:00Z"); // 00:00 the next day in New York

  it("keeps an item in hand until local midnight, then returns it without any event", () => {
    const bucket = dailyDraw();
    const [id = ""] = applyOk(
      bucket,
      draw(bucket, request(createSeededRng(1), morning, idMaker("e"))),
    );
    const events = JSON.stringify(bucket.events);
    expect(statusOf(bucket, id, midnight - 1)).toBe("hand");
    expect(statusOf(bucket, id, midnight)).toBe("in");
    expect(deriveItems(bucket, new Date(midnight)).find((s) => s.item.id === id)).toMatchObject({
      heldBy: null,
      heldSince: null,
      timesDrawn: 1,
    });
    expect(JSON.stringify(bucket.events)).toBe(events);
  });

  it("returns an item drawn at exactly midnight only at the following midnight", () => {
    const bucket = dailyDraw(1, { maxInHand: 1, drawCount: 1 });
    applyOk(bucket, draw(bucket, request(createSeededRng(1), midnight, idMaker("e"))));
    expect(statusOf(bucket, "i0", midnight + 23 * HOUR)).toBe("hand");
    expect(statusOf(bucket, "i0", midnight + 24 * HOUR)).toBe("in");
  });

  it("returns an item held for several days once, not repeatedly", () => {
    const bucket = dailyDraw(1, { maxInHand: 1, drawCount: 1 });
    applyOk(bucket, draw(bucket, request(createSeededRng(1), morning, idMaker("e"))));
    expect(statusOf(bucket, "i0", morning + 5 * 24 * HOUR)).toBe("in");
  });

  it("lets tomorrow's draw start fresh instead of reporting a full hand", () => {
    const bucket = dailyDraw(2);
    const rng = createSeededRng(2);
    const makeId = idMaker("e");
    expect(applyOk(bucket, draw(bucket, request(rng, morning, makeId)))).toHaveLength(2);
    expect(draw(bucket, request(rng, morning + HOUR, makeId))).toMatchObject({
      ok: false,
      reason: "hand-full",
    });
    const nextMorning = morning + 24 * HOUR;
    expect(checkDraw(bucket, "me", new Date(nextMorning)).ok).toBe(true);
    expect(applyOk(bucket, draw(bucket, request(rng, nextMorning, makeId)))).toHaveLength(2);
  });

  it("counts an item finished before midnight, even if its event reaches the bucket later", () => {
    const bucket = dailyDraw(1, { maxInHand: 1, drawCount: 1 });
    const makeId = idMaker("e");
    applyOk(bucket, draw(bucket, request(createSeededRng(1), morning, makeId)));
    // A phone that was offline finished the item at 23:50 local and syncs on day 3.
    const late = resolve(bucket, {
      itemId: "i0",
      kind: "done",
      memberId: "me",
      deviceId: "phone",
      now: new Date(midnight - 10 * 60_000),
      makeId,
    });
    applyOk(bucket, late);
    expect(deriveItems(bucket, new Date(midnight + 40 * HOUR))[0]).toMatchObject({
      status: "in",
      timesDone: 1,
      lastDoneAt: new Date(midnight - 10 * 60_000).toISOString(),
    });
  });

  it("ignores a finish stamped after the item went back", () => {
    const bucket = dailyDraw(1, { maxInHand: 1, drawCount: 1 });
    const makeId = idMaker("e");
    applyOk(bucket, draw(bucket, request(createSeededRng(1), morning, makeId)));
    expect(
      resolve(bucket, {
        itemId: "i0",
        kind: "done",
        memberId: "me",
        deviceId: "d1",
        now: new Date(midnight + HOUR),
        makeId,
      }),
    ).toEqual({ ok: false, reason: "not-in-hand" });
    bucket.events.push({
      id: "late",
      itemId: "i0",
      kind: "done",
      at: new Date(midnight + HOUR).toISOString(),
      memberId: "me",
      deviceId: "d1",
      onDone: "return",
    });
    expect(deriveItems(bucket, new Date(midnight + 2 * HOUR))[0]).toMatchObject({
      status: "in",
      timesDone: 0,
    });
  });

  it("gives the turn back unless the rule says a toss-back uses it up", () => {
    for (const [countsAsDrawn, expected] of [
      [false, false],
      [true, true],
    ] as const) {
      const bucket = dailyDraw(1, {
        maxInHand: 1,
        drawCount: 1,
        tossBackCountsAsDrawn: countsAsDrawn,
      });
      applyOk(bucket, draw(bucket, request(createSeededRng(1), morning, idMaker("e"))));
      expect(deriveItems(bucket, new Date(morning + HOUR))[0]?.drawnThisCycle).toBe(true);
      expect(deriveItems(bucket, new Date(midnight))[0]?.drawnThisCycle).toBe(expected);
    }
  });

  it("follows the clock change when daylight time ends", () => {
    const bucket = dailyDraw(1, { maxInHand: 1, drawCount: 1 });
    const evening = utc("2026-10-31T23:00:00Z"); // 19:00 on 31 October in New York
    applyOk(bucket, draw(bucket, request(createSeededRng(1), evening, idMaker("e"))));
    expect(statusOf(bucket, "i0", utc("2026-11-01T03:59:00Z"))).toBe("hand");
    expect(statusOf(bucket, "i0", utc("2026-11-01T04:00:00Z"))).toBe("in"); // 00:00 EDT
  });

  it("uses UTC when the bucket has no time zone", () => {
    const bucket = makeBucket({
      preset: "daily-draw",
      items: 1,
      rules: { maxInHand: 1, drawCount: 1 },
    });
    applyOk(
      bucket,
      draw(bucket, request(createSeededRng(1), utc("2026-10-12T13:00:00Z"), idMaker("e"))),
    );
    expect(statusOf(bucket, "i0", utc("2026-10-12T23:59:00Z"))).toBe("hand");
    expect(statusOf(bucket, "i0", utc("2026-10-13T00:00:00Z"))).toBe("in");
  });

  it("does nothing when the rule is off or the time zone is not valid", () => {
    const off = makeBucket({ preset: "weighted", items: 1 });
    applyOk(off, draw(off, request(createSeededRng(1), morning, idMaker("e"))));
    expect(statusOf(off, "i0", morning + 30 * 24 * HOUR)).toBe("hand");

    const broken = dailyDraw(1, { maxInHand: 1, drawCount: 1 });
    broken.timeZone = "Nowhere/Land";
    applyOk(broken, draw(broken, request(createSeededRng(1), morning, idMaker("e"))));
    expect(autoReturnOf(broken)).toBeUndefined();
    expect(statusOf(broken, "i0", morning + 30 * 24 * HOUR)).toBe("hand");
  });
});

describe("autoReturnOf", () => {
  it("describes the rule for a Daily Draw bucket", () => {
    expect(autoReturnOf(dailyDraw())).toEqual({
      timeOfDay: "00:00",
      timeZone: "America/New_York",
      countsAsDrawn: false,
    });
  });
});

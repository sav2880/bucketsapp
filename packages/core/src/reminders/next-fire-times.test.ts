// SPDX-License-Identifier: Apache-2.0

import { describe, expect, it } from "vitest";
import { HOUR, T0, applyOk, idMaker, makeBucket, request } from "../../test/builders";
import { duration } from "../duration";
import { draw } from "../engine/draw";
import { resolve } from "../engine/resolve";
import { createSeededRng } from "../random/rng";
import { nextFireTimes, type BucketReminder, type FireQuery } from "./next-fire-times";

const at = (hours: number): string => new Date(T0 + hours * HOUR).toISOString();

function reminder(
  trigger: BucketReminder["trigger"],
  extra: Partial<BucketReminder> = {},
): BucketReminder {
  return {
    id: "r1",
    bucketId: "b",
    enabled: true,
    trigger,
    action: "notify",
    delivery: { desktop: true, webPush: false, sound: false },
    snoozeOptions: [duration(15, "minutes")],
    ...extra,
  };
}

function query(nowHours: number, sinceHours = nowHours - 1, timeZone = "UTC"): FireQuery {
  return {
    memberId: "me",
    now: new Date(T0 + nowHours * HOUR),
    since: new Date(T0 + sinceHours * HOUR),
    timeZone,
  };
}

const run = (r: BucketReminder[], bucket = makeBucket(), q = query(0)) =>
  nextFireTimes(r, { b: bucket }, q);

describe("nextFireTimes", () => {
  it("skips disabled reminders and reminders for missing buckets", () => {
    const trigger = { kind: "bucket-reopens" } as const;
    expect(run([reminder(trigger, { enabled: false })])).toEqual({ times: [], problems: [] });
    expect(run([reminder(trigger, { bucketId: "gone" })])).toEqual({ times: [], problems: [] });
  });

  describe("schedule", () => {
    it("returns the next occurrence after since, with the action", () => {
      const result = run(
        [
          reminder(
            { kind: "schedule", rrule: "FREQ=DAILY;BYHOUR=18", timezone: "UTC" },
            { action: "draw-for-me" },
          ),
        ],
        makeBucket(),
        query(0),
      );
      expect(result.times).toEqual([
        {
          reminderId: "r1",
          bucketId: "b",
          at: "2026-09-30T18:00:00.000Z",
          scheduledAt: "2026-09-30T18:00:00.000Z",
          action: "draw-for-me",
        },
      ]);
    });

    it("reports bad rules and zones as problems instead of throwing", () => {
      const bad = [
        reminder({ kind: "schedule", rrule: "FREQ=YEARLY", timezone: "UTC" }, { id: "a" }),
        reminder({ kind: "schedule", rrule: "FREQ=DAILY", timezone: "Nowhere/Land" }, { id: "b2" }),
      ];
      expect(run(bad).problems).toEqual([
        { reminderId: "a", reason: "unsupported-freq" },
        { reminderId: "b2", reason: "invalid-timezone" },
      ]);
    });

    it("yields nothing when the rule never fires within the horizon", () => {
      const never = reminder({
        kind: "schedule",
        rrule: "FREQ=MONTHLY;INTERVAL=12;BYMONTHDAY=30",
        timezone: "UTC",
        startsOn: "2026-02-01",
      });
      expect(run([never])).toEqual({ times: [], problems: [] });
    });
  });

  describe("in-hand-too-long", () => {
    it("fires for each item the member holds, after the chosen time", () => {
      const bucket = makeBucket({
        preset: "weighted",
        items: 3,
        rules: { maxInHand: 2, drawCount: 2 },
      });
      applyOk(bucket, draw(bucket, request(createSeededRng(1), T0, idMaker("e"))));
      const result = run(
        [reminder({ kind: "in-hand-too-long", after: duration(3, "days") })],
        bucket,
        query(1, 0),
      );
      expect(result.times).toHaveLength(2);
      expect(
        result.times.every(
          (t) => t.at === new Date(T0 + 72 * HOUR).toISOString() && t.itemId !== undefined,
        ),
      ).toBe(true);
    });

    it("ignores other members' items and anything already past since", () => {
      const bucket = makeBucket({ preset: "round-robin", items: 2, members: { you: "drawer" } });
      applyOk(bucket, draw(bucket, request(createSeededRng(1), T0, idMaker("e"), "you")));
      const trigger = { kind: "in-hand-too-long", after: duration(1, "hours") } as const;
      expect(run([reminder(trigger)], bucket, query(0.5)).times).toEqual([]);
      const mine = makeBucket({ items: 1 });
      applyOk(mine, draw(mine, request(createSeededRng(1), T0, idMaker("e"))));
      expect(run([reminder(trigger)], mine, query(3, 2)).times).toEqual([]);
      expect(run([reminder(trigger)], mine, query(3, 0.5)).times).toHaveLength(1);
    });
  });

  describe("bucket-reopens", () => {
    it("gives the end of the cooldown when every item is resting", () => {
      const bucket = makeBucket({ preset: "mystery-bag", items: 1 });
      const makeId = idMaker("e");
      const [id = ""] = applyOk(bucket, draw(bucket, request(createSeededRng(1), T0, makeId)));
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
      expect(
        run([reminder({ kind: "bucket-reopens" })], bucket, query(1, 0)).times.map((t) => t.at),
      ).toEqual([at(24)]);
    });

    it("has nothing to say when the bucket is open or locked", () => {
      expect(run([reminder({ kind: "bucket-reopens" })]).times).toEqual([]);
      const locked = makeBucket({ items: 2 });
      applyOk(locked, draw(locked, request(createSeededRng(1), T0, idMaker("e"))));
      expect(run([reminder({ kind: "bucket-reopens" })], locked, query(1, 0)).times).toEqual([]);
    });
  });

  describe("cycle-complete", () => {
    it("fires when every item has had a turn", () => {
      const bucket = makeBucket({ preset: "rotation-pool", items: 1, rules: { maxInHand: 1 } });
      delete bucket.rules.cycleResetAfter;
      const makeId = idMaker("e");
      const [id = ""] = applyOk(bucket, draw(bucket, request(createSeededRng(1), T0, makeId)));
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
      const trigger = { kind: "cycle-complete" } as const;
      expect(run([reminder(trigger)], bucket, query(2, 0)).times.map((t) => t.scheduledAt)).toEqual(
        [at(1)],
      );
      expect(run([reminder(trigger)], bucket, query(3, 2)).times).toEqual([]);
    });

    it("never fires in a bucket that repeats freely", () => {
      expect(
        run([reminder({ kind: "cycle-complete" })], makeBucket({ preset: "weighted" })).times,
      ).toEqual([]);
    });

    it("does not fire while items are still waiting", () => {
      const bucket = makeBucket({ preset: "rotation-pool", items: 3 });
      applyOk(bucket, draw(bucket, request(createSeededRng(1), T0, idMaker("e"))));
      expect(run([reminder({ kind: "cycle-complete" })], bucket, query(1, 0)).times).toEqual([]);
    });
  });

  describe("running-low", () => {
    it("fires while fewer items than the threshold are eligible, at the time of the latest activity", () => {
      const bucket = makeBucket({ items: 3 });
      applyOk(bucket, draw(bucket, request(createSeededRng(1), T0 + HOUR, idMaker("e"))));
      const low = run([reminder({ kind: "running-low", below: 3 })], bucket, query(2, 0));
      expect(low.times.map((t) => t.scheduledAt)).toEqual([at(1)]);
      expect(run([reminder({ kind: "running-low", below: 2 })], bucket, query(2, 0)).times).toEqual(
        [],
      );
    });

    it("uses the bucket's creation time when nothing has happened yet", () => {
      const bucket = makeBucket({ items: 1 });
      expect(
        run([reminder({ kind: "running-low", below: 5 })], bucket, query(0, -24 * 40)).times,
      ).toHaveLength(1);
    });

    it("does not count archived items", () => {
      const bucket = makeBucket({ items: 2 });
      const first = bucket.items["i0"];
      if (first) first.archived = true;
      expect(
        run([reminder({ kind: "running-low", below: 2 })], bucket, query(0, -24 * 40)).times,
      ).toHaveLength(1);
    });
  });

  describe("shared-activity", () => {
    it("reports what others did, not what the member did themselves", () => {
      const bucket = makeBucket({ preset: "round-robin", items: 3, members: { you: "drawer" } });
      const makeId = idMaker("e");
      const rng = createSeededRng(2);
      const [theirs = ""] = applyOk(bucket, draw(bucket, request(rng, T0, makeId, "you")));
      applyOk(bucket, draw(bucket, request(rng, T0 + HOUR, makeId, "me")));
      applyOk(
        bucket,
        resolve(bucket, {
          itemId: theirs,
          kind: "done",
          memberId: "you",
          deviceId: "d9",
          now: new Date(T0 + 2 * HOUR),
          makeId,
        }),
      );
      const all = reminder({ kind: "shared-activity", events: ["drew", "finished"] });
      const result = run([all], bucket, query(3, -1));
      expect(result.times.map((t) => [t.activity, t.itemId, t.scheduledAt])).toEqual([
        ["drew", theirs, at(0)],
        ["finished", theirs, at(2)],
      ]);
      expect(
        run([reminder({ kind: "shared-activity", events: ["finished"] })], bucket, query(3, 1))
          .times,
      ).toHaveLength(1);
    });

    it("reports items other members added, and skips tosses", () => {
      const bucket = makeBucket({ preset: "round-robin", items: 2, members: { you: "editor" } });
      const added = bucket.items["i1"];
      if (added) added.createdBy = "you";
      const makeId = idMaker("e");
      const [id = ""] = applyOk(
        bucket,
        draw(bucket, request(createSeededRng(3), T0, makeId, "you")),
      );
      applyOk(
        bucket,
        resolve(bucket, {
          itemId: id,
          kind: "tossed-back",
          memberId: "you",
          deviceId: "d9",
          now: new Date(T0 + HOUR),
          makeId,
        }),
      );
      const result = run(
        [reminder({ kind: "shared-activity", events: ["added-item", "drew", "finished"] })],
        bucket,
        query(2, -24 * 40),
      );
      expect(result.times.map((t) => t.activity).sort()).toEqual(["added-item", "drew"]);
    });
  });

  describe("quiet hours, expiry and ordering", () => {
    const daily = (extra: Partial<BucketReminder>, id = "r1") =>
      reminder(
        { kind: "schedule", rrule: "FREQ=DAILY;BYHOUR=23", timezone: "UTC" },
        { id, ...extra },
      );

    it("holds a notification until quiet hours end, keeping the original time", () => {
      const [time] = run([daily({ quietHours: { start: "22:00", end: "07:00" } })]).times;
      expect(time).toMatchObject({
        scheduledAt: "2026-09-30T23:00:00.000Z",
        at: "2026-10-01T07:00:00.000Z",
      });
    });

    it("leaves notifications outside quiet hours alone, including a same-day window and an empty one", () => {
      const outside = run([daily({ quietHours: { start: "01:00", end: "06:00" } })]).times[0];
      expect(outside?.at).toBe("2026-09-30T23:00:00.000Z");
      const sameDay = run([daily({ quietHours: { start: "22:00", end: "23:30" } })]).times[0];
      expect(sameDay?.at).toBe("2026-09-30T23:30:00.000Z");
      const empty = run([daily({ quietHours: { start: "22:00", end: "22:00" } })]).times[0];
      expect(empty?.at).toBe("2026-09-30T23:00:00.000Z");
    });

    it("measures quiet hours in the caller's zone", () => {
      // 23:00 UTC is 19:00 in New York (EDT), so a 22:00–07:00 window does not apply.
      const result = run(
        [daily({ quietHours: { start: "22:00", end: "07:00" } })],
        makeBucket(),
        query(0, -1, "America/New_York"),
      );
      expect(result.times[0]?.at).toBe("2026-09-30T23:00:00.000Z");
    });

    it("reports malformed quiet hours and zones as problems", () => {
      expect(run([daily({ quietHours: { start: "late", end: "07:00" } })]).problems).toEqual([
        { reminderId: "r1", reason: "invalid-quiet-hours" },
      ]);
      expect(
        run(
          [daily({ quietHours: { start: "22:00", end: "07:00" } })],
          makeBucket(),
          query(0, -1, "Nowhere/Land"),
        ).problems,
      ).toEqual([{ reminderId: "r1", reason: "invalid-timezone" }]);
    });

    it("drops anything delivered after the reminder expires", () => {
      expect(run([daily({ expiresAt: "2026-09-30T22:00:00Z" })]).times).toEqual([]);
      expect(run([daily({ expiresAt: "2026-09-30T23:00:00Z" })]).times).toHaveLength(1);
      expect(
        run([
          daily({
            expiresAt: "2026-09-30T23:30:00Z",
            quietHours: { start: "22:00", end: "07:00" },
          }),
        ]).times,
      ).toEqual([]);
    });

    it("sorts by delivery time, then reminder id", () => {
      const result = run([
        daily({}, "z"),
        reminder({ kind: "schedule", rrule: "FREQ=DAILY;BYHOUR=10", timezone: "UTC" }, { id: "m" }),
        daily({}, "a"),
      ]);
      expect(result.times.map((t) => t.reminderId)).toEqual(["m", "a", "z"]);
    });
  });
});

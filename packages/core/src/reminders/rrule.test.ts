// SPDX-License-Identifier: Apache-2.0

import { describe, expect, it } from "vitest";
import { nextOccurrence, parseRRule, type RecurrenceRule } from "./rrule";

function rule(text: string): RecurrenceRule {
  const parsed = parseRRule(text);
  if (!parsed.ok) throw new Error(`could not parse ${text}: ${parsed.reason}`);
  return parsed.rule;
}

function next(text: string, after: string, timeZone = "UTC", startsOn?: string): string | null {
  const result = nextOccurrence(rule(text), startsOn, timeZone, new Date(after));
  if (!result.ok) throw new Error(result.reason);
  return result.at ? result.at.toISOString() : null;
}

describe("parseRRule", () => {
  it("reads every supported part, ignoring case and a leading RRULE:", () => {
    expect(rule("RRULE:freq=weekly;interval=2;byday=mo,we;byhour=9;byminute=30")).toEqual({
      freq: "WEEKLY",
      interval: 2,
      byDay: [1, 3],
      byMonthDay: [],
      hour: 9,
      minute: 30,
    });
    expect(rule("FREQ=MONTHLY;BYMONTHDAY=-1,15,15;")).toMatchObject({ byMonthDay: [-1, 15] });
  });

  it.each([
    ["FREQ=YEARLY", "unsupported-freq"],
    ["BYHOUR=9", "unsupported-freq"],
    ["FREQ=DAILY;COUNT=3", "unsupported-part"],
    ["FREQ=WEEKLY;BYDAY=1MO", "invalid-part"],
    ["FREQ=WEEKLY;BYDAY=XX", "invalid-part"],
    ["FREQ=DAILY;INTERVAL=0", "invalid-part"],
    ["FREQ=DAILY;INTERVAL=abc", "invalid-part"],
    ["FREQ=DAILY;BYHOUR=24", "invalid-part"],
    ["FREQ=DAILY;BYMINUTE=60", "invalid-part"],
    ["FREQ=MONTHLY;BYMONTHDAY=0", "invalid-part"],
    ["FREQ=MONTHLY;BYMONTHDAY=32", "invalid-part"],
  ])("refuses %s as %s", (text, reason) => {
    expect(parseRRule(text)).toMatchObject({ ok: false, reason });
  });
});

describe("nextOccurrence", () => {
  it("finds the next daily time, strictly after the given instant", () => {
    expect(next("FREQ=DAILY;BYHOUR=9", "2026-10-30T08:00:00Z")).toBe("2026-10-30T09:00:00.000Z");
    expect(next("FREQ=DAILY;BYHOUR=9", "2026-10-30T09:00:00Z")).toBe("2026-10-31T09:00:00.000Z");
  });

  it("finds weekdays at 09:00", () => {
    const text = "FREQ=WEEKLY;BYDAY=MO,TU,WE,TH,FR;BYHOUR=9";
    expect(next(text, "2026-10-30T10:00:00Z")).toBe("2026-11-02T09:00:00.000Z"); // Fri → Mon
    expect(next(text, "2026-10-28T08:00:00Z")).toBe("2026-10-28T09:00:00.000Z");
  });

  it("repeats every other week from a start date", () => {
    const text = "FREQ=WEEKLY;INTERVAL=2;BYDAY=MO;BYHOUR=8";
    expect(next(text, "2026-10-01T00:00:00Z", "UTC", "2026-10-05")).toBe(
      "2026-10-05T08:00:00.000Z",
    );
    expect(next(text, "2026-10-05T09:00:00Z", "UTC", "2026-10-05")).toBe(
      "2026-10-19T08:00:00.000Z",
    );
  });

  it("uses the start date's weekday when BYDAY is absent", () => {
    expect(next("FREQ=WEEKLY;BYHOUR=7", "2026-10-30T00:00:00Z", "UTC", "2026-10-05")).toBe(
      "2026-11-02T07:00:00.000Z",
    );
  });

  it("does not fire before the start date", () => {
    expect(next("FREQ=DAILY;BYHOUR=9", "2026-10-01T00:00:00Z", "UTC", "2026-10-10")).toBe(
      "2026-10-10T09:00:00.000Z",
    );
  });

  it("repeats every third day from a start date", () => {
    const text = "FREQ=DAILY;INTERVAL=3;BYHOUR=6";
    expect(next(text, "2026-10-02T07:00:00Z", "UTC", "2026-10-01")).toBe(
      "2026-10-04T06:00:00.000Z",
    );
    expect(next(text, "2026-10-04T06:00:00Z", "UTC", "2026-10-01")).toBe(
      "2026-10-07T06:00:00.000Z",
    );
  });

  it("handles month days, negative days, short months and intervals", () => {
    expect(next("FREQ=MONTHLY;BYMONTHDAY=1;BYHOUR=9", "2026-10-30T00:00:00Z")).toBe(
      "2026-11-01T09:00:00.000Z",
    );
    expect(next("FREQ=MONTHLY;BYMONTHDAY=-1;BYHOUR=9", "2026-02-01T00:00:00Z")).toBe(
      "2026-02-28T09:00:00.000Z",
    );
    // The 31st is skipped in months that lack it.
    expect(next("FREQ=MONTHLY;BYMONTHDAY=31;BYHOUR=9", "2026-10-31T10:00:00Z")).toBe(
      "2026-12-31T09:00:00.000Z",
    );
    expect(
      next("FREQ=MONTHLY;INTERVAL=3;BYMONTHDAY=15", "2026-02-01T00:00:00Z", "UTC", "2026-01-01"),
    ).toBe("2026-04-15T00:00:00.000Z");
    expect(next("FREQ=MONTHLY;BYHOUR=9", "2026-10-30T00:00:00Z", "UTC", "2026-01-20")).toBe(
      "2026-11-20T09:00:00.000Z",
    );
  });

  it("keeps wall-clock time across daylight-saving changes", () => {
    const text = "FREQ=DAILY;BYHOUR=9";
    expect(next(text, "2026-03-07T20:00:00Z", "America/New_York")).toBe("2026-03-08T13:00:00.000Z"); // EDT, UTC-4
    expect(next(text, "2026-03-06T20:00:00Z", "America/New_York")).toBe("2026-03-07T14:00:00.000Z"); // EST, UTC-5
  });

  it("fires late rather than never when the local time does not exist", () => {
    // 02:30 on 2026-03-08 is skipped in New York; the clock jumps from 02:00 to 03:00.
    expect(
      next("FREQ=DAILY;BYHOUR=2;BYMINUTE=30", "2026-03-08T00:00:00Z", "America/New_York"),
    ).toBe("2026-03-08T07:30:00.000Z");
  });

  it("uses the first occurrence when the local time happens twice", () => {
    // 01:30 on 2026-11-01 happens in EDT (05:30Z) and again in EST (06:30Z).
    expect(
      next("FREQ=DAILY;BYHOUR=1;BYMINUTE=30", "2026-11-01T00:00:00Z", "America/New_York"),
    ).toBe("2026-11-01T05:30:00.000Z");
  });

  it("uses the zone's date, not UTC's, to pick the day", () => {
    // 2026-10-31T12:00Z is already 01:00 on 1 November in Auckland (UTC+13), so 09:00 that day
    // (2026-10-31T20:00Z) is still to come. A UTC reading would wrongly wait until December.
    expect(
      next("FREQ=MONTHLY;BYMONTHDAY=1;BYHOUR=9", "2026-10-31T12:00:00Z", "Pacific/Auckland"),
    ).toBe("2026-10-31T20:00:00.000Z");
    // Once that has passed, the next one is 1 December local.
    expect(
      next("FREQ=MONTHLY;BYMONTHDAY=1;BYHOUR=9", "2026-10-31T23:30:00Z", "Pacific/Auckland"),
    ).toBe("2026-11-30T20:00:00.000Z");
  });

  it("reports unusable input as typed errors", () => {
    const after = new Date("2026-10-30T00:00:00Z");
    expect(nextOccurrence(rule("FREQ=DAILY"), undefined, "Mars/Olympus", after)).toMatchObject({
      reason: "invalid-timezone",
    });
    expect(nextOccurrence(rule("FREQ=DAILY"), "2026-13-01", "UTC", after)).toMatchObject({
      reason: "invalid-start",
    });
    expect(nextOccurrence(rule("FREQ=DAILY"), "soon", "UTC", after)).toMatchObject({
      reason: "invalid-start",
    });
    expect(nextOccurrence(rule("FREQ=DAILY;INTERVAL=2"), undefined, "UTC", after)).toEqual({
      ok: false,
      reason: "interval-needs-start",
    });
    expect(nextOccurrence(rule("FREQ=WEEKLY"), undefined, "UTC", after)).toEqual({
      ok: false,
      reason: "missing-byday",
    });
    expect(nextOccurrence(rule("FREQ=MONTHLY"), undefined, "UTC", after)).toEqual({
      ok: false,
      reason: "missing-bymonthday",
    });
  });

  it("gives up quietly when a rule never matches within ten years", () => {
    // February never has a 30th.
    expect(
      next("FREQ=MONTHLY;INTERVAL=12;BYMONTHDAY=30", "2026-10-30T00:00:00Z", "UTC", "2026-02-01"),
    ).toBeNull();
  });
});

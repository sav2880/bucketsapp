// SPDX-License-Identifier: Apache-2.0

/**
 * A deliberately small subset of RFC 5545 recurrence rules, enough for plan.md §7.1's
 * `schedule` trigger: DAILY, WEEKLY and MONTHLY with INTERVAL, BYDAY, BYMONTHDAY, BYHOUR and
 * BYMINUTE. Anything else is refused with a typed error rather than guessed at.
 *
 * Time zones come from `Intl`, whose tz database is the platform's; no dependency is added.
 */

/** A parsed rule. Weekdays count from Sunday = 0. */
export interface RecurrenceRule {
  /** How often the rule repeats. */
  freq: "DAILY" | "WEEKLY" | "MONTHLY";
  /** Repeat every this many days, weeks or months. */
  interval: number;
  /** Weekdays (0 = Sunday … 6 = Saturday), for weekly rules. */
  byDay: number[];
  /** Days of the month; negative counts from the end (-1 = last day). */
  byMonthDay: number[];
  /** Local hour of day, 0–23. */
  hour: number;
  /** Local minute, 0–59. */
  minute: number;
}

/** Why a rule or time zone could not be used. */
export type RecurrenceError =
  | { ok: false; reason: "unsupported-freq" | "unsupported-part" | "invalid-part"; detail: string }
  | { ok: false; reason: "interval-needs-start" | "missing-byday" | "missing-bymonthday" }
  | { ok: false; reason: "invalid-timezone" | "invalid-start"; detail: string };

const WEEKDAYS = ["SU", "MO", "TU", "WE", "TH", "FR", "SA"];
const MAX_INTERVAL = 366;
/** How far ahead to look for an occurrence (about ten years); a valid rule always hits sooner. */
const HORIZON_DAYS = 3660;
const DAY_MS = 86_400_000;

function integer(text: string, min: number, max: number): number | undefined {
  if (!/^-?\d+$/.test(text)) return undefined;
  const n = Number(text);
  return n >= min && n <= max ? n : undefined;
}

/**
 * Parses a recurrence rule string such as `FREQ=WEEKLY;BYDAY=MO,TU,WE,TH,FR;BYHOUR=9`.
 *
 * Time of day comes from BYHOUR and BYMINUTE (default 00:00), because plan.md stores no DTSTART.
 *
 * @param text - The rule, with or without a leading `RRULE:`.
 * @returns The rule, or why it is not supported.
 */
export function parseRRule(text: string): { ok: true; rule: RecurrenceRule } | RecurrenceError {
  const rule: RecurrenceRule = {
    freq: "DAILY",
    interval: 1,
    byDay: [],
    byMonthDay: [],
    hour: 0,
    minute: 0,
  };
  let freq: string | undefined;
  for (const part of text.replace(/^RRULE:/i, "").split(";")) {
    if (part.trim() === "") continue;
    const [rawKey = "", value = ""] = part.split("=");
    const key = rawKey.trim().toUpperCase();
    const bad = (): RecurrenceError => ({ ok: false, reason: "invalid-part", detail: part });
    switch (key) {
      case "FREQ":
        freq = value.toUpperCase();
        break;
      case "INTERVAL": {
        const n = integer(value, 1, MAX_INTERVAL);
        if (n === undefined) return bad();
        rule.interval = n;
        break;
      }
      case "BYDAY": {
        const days = value
          .toUpperCase()
          .split(",")
          .map((d) => WEEKDAYS.indexOf(d));
        if (days.length === 0 || days.includes(-1)) return bad();
        rule.byDay = [...new Set(days)].sort((a, b) => a - b);
        break;
      }
      case "BYMONTHDAY": {
        const days = value.split(",").map((d) => integer(d, -31, 31));
        if (days.some((d) => d === undefined || d === 0)) return bad();
        rule.byMonthDay = [...new Set(days as number[])];
        break;
      }
      case "BYHOUR": {
        const n = integer(value, 0, 23);
        if (n === undefined) return bad();
        rule.hour = n;
        break;
      }
      case "BYMINUTE": {
        const n = integer(value, 0, 59);
        if (n === undefined) return bad();
        rule.minute = n;
        break;
      }
      default:
        return { ok: false, reason: "unsupported-part", detail: part };
    }
  }
  if (freq !== "DAILY" && freq !== "WEEKLY" && freq !== "MONTHLY") {
    return { ok: false, reason: "unsupported-freq", detail: freq ?? "(missing)" };
  }
  rule.freq = freq;
  return { ok: true, rule };
}

function formatter(timeZone: string): Intl.DateTimeFormat | undefined {
  try {
    return new Intl.DateTimeFormat("en-US", {
      timeZone,
      hourCycle: "h23",
      year: "numeric",
      month: "numeric",
      day: "numeric",
      hour: "numeric",
      minute: "numeric",
    });
  } catch {
    return undefined;
  }
}

interface LocalTime {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
}

function localTime(fmt: Intl.DateTimeFormat, ms: number): LocalTime {
  const get = (type: string): number =>
    Number(fmt.formatToParts(ms).find((p) => p.type === type)?.value ?? 0);
  return {
    year: get("year"),
    month: get("month"),
    day: get("day"),
    hour: get("hour"),
    minute: get("minute"),
  };
}

/** Offset of the zone from UTC at an instant, in ms (positive east of Greenwich). */
function offsetAt(fmt: Intl.DateTimeFormat, ms: number): number {
  const l = localTime(fmt, ms);
  return Date.UTC(l.year, l.month - 1, l.day, l.hour, l.minute) - Math.floor(ms / 60_000) * 60_000;
}

/**
 * Converts a wall-clock time in a zone to an instant.
 *
 * Around daylight-saving changes: a time that happens twice (clocks go back) resolves to its first
 * occurrence; a time that never happens (clocks go forward) resolves to the same offset as the
 * moment after the gap, i.e. it fires an hour late rather than not at all.
 */
function zonedToUtc(
  fmt: Intl.DateTimeFormat,
  y: number,
  mo: number,
  d: number,
  h: number,
  mi: number,
): number {
  const guess = Date.UTC(y, mo - 1, d, h, mi);
  const first = guess - offsetAt(fmt, guess);
  const second = guess - offsetAt(fmt, first);
  const matches = [first, second].filter((t) => {
    const l = localTime(fmt, t);
    return l.year === y && l.month === mo && l.day === d && l.hour === h && l.minute === mi;
  });
  return matches.length > 0 ? Math.min(...matches) : Math.max(first, second);
}

const daysFromCivil = (y: number, m: number, d: number): number => Date.UTC(y, m - 1, d) / DAY_MS;

function parseStart(startsOn: string | undefined): number | undefined | "invalid" {
  if (startsOn === undefined) return undefined;
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(startsOn);
  if (!m) return "invalid";
  const [y, mo, d] = [Number(m[1]), Number(m[2]), Number(m[3])];
  const date = new Date(Date.UTC(y, mo - 1, d));
  return date.getUTCMonth() === mo - 1 && date.getUTCDate() === d
    ? date.getTime() / DAY_MS
    : "invalid";
}

/**
 * Finds the first time a rule fires strictly after an instant.
 *
 * @param rule - A parsed rule.
 * @param startsOn - First possible local date (`YYYY-MM-DD`); anchors INTERVAL and supplies the
 *   default weekday or day of month. Required when `rule.interval` is above 1.
 * @param timeZone - IANA zone the rule's wall-clock times are in.
 * @param after - Only instants later than this count.
 * @returns The instant, `null` if none falls within ten years, or why the rule cannot run.
 */
export function nextOccurrence(
  rule: RecurrenceRule,
  startsOn: string | undefined,
  timeZone: string,
  after: Date,
): { ok: true; at: Date | null } | RecurrenceError {
  const fmt = formatter(timeZone);
  if (!fmt) return { ok: false, reason: "invalid-timezone", detail: timeZone };
  const start = parseStart(startsOn);
  if (start === "invalid") return { ok: false, reason: "invalid-start", detail: startsOn ?? "" };
  if (rule.interval > 1 && start === undefined)
    return { ok: false, reason: "interval-needs-start" };

  const startDate = start === undefined ? undefined : new Date(start * DAY_MS);
  const byDay = rule.byDay.length > 0 ? rule.byDay : startDate ? [startDate.getUTCDay()] : [];
  const byMonthDay =
    rule.byMonthDay.length > 0 ? rule.byMonthDay : startDate ? [startDate.getUTCDate()] : [];
  if (rule.freq === "WEEKLY" && byDay.length === 0) return { ok: false, reason: "missing-byday" };
  if (rule.freq === "MONTHLY" && byMonthDay.length === 0)
    return { ok: false, reason: "missing-bymonthday" };

  const mondayOf = (dayNumber: number): number =>
    dayNumber - ((new Date(dayNumber * DAY_MS).getUTCDay() + 6) % 7);
  const monthIndex = (date: Date): number => date.getUTCFullYear() * 12 + date.getUTCMonth();

  const here = localTime(fmt, after.getTime());
  const firstDay = daysFromCivil(here.year, here.month, here.day);
  for (let offset = 0; offset <= HORIZON_DAYS; offset++) {
    const dayNumber = firstDay + offset;
    if (start !== undefined && dayNumber < start) continue;
    const date = new Date(dayNumber * DAY_MS);
    let hit: boolean;
    if (rule.freq === "DAILY") {
      hit = start === undefined || (dayNumber - start) % rule.interval === 0;
    } else if (rule.freq === "WEEKLY") {
      hit =
        byDay.includes(date.getUTCDay()) &&
        (start === undefined ||
          ((mondayOf(dayNumber) - mondayOf(start)) / 7) % rule.interval === 0);
    } else {
      const length = new Date(
        Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + 1, 0),
      ).getUTCDate();
      const days = byMonthDay.map((d) => (d > 0 ? d : length + 1 + d));
      hit =
        days.includes(date.getUTCDate()) &&
        (startDate === undefined ||
          (monthIndex(date) - monthIndex(startDate)) % rule.interval === 0);
    }
    if (!hit) continue;
    const at = zonedToUtc(
      fmt,
      date.getUTCFullYear(),
      date.getUTCMonth() + 1,
      date.getUTCDate(),
      rule.hour,
      rule.minute,
    );
    if (at > after.getTime()) return { ok: true, at: new Date(at) };
  }
  return { ok: true, at: null };
}

/**
 * Minutes after local midnight at an instant, in a zone.
 *
 * @param timeZone - IANA zone.
 * @param at - The instant.
 * @returns 0–1439, or `undefined` when the zone is not valid.
 */
export function minutesOfDay(timeZone: string, at: Date): number | undefined {
  const fmt = formatter(timeZone);
  if (!fmt) return undefined;
  const l = localTime(fmt, at.getTime());
  return l.hour * 60 + l.minute;
}

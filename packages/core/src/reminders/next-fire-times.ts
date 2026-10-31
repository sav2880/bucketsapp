// SPDX-License-Identifier: Apache-2.0

import { durationToMs, type Duration } from "../duration";
import { checkDraw } from "../engine/draw";
import { deriveItems } from "../engine/derive";
import type { Bucket } from "../model/types";
import { minutesOfDay, nextOccurrence, parseRRule, type RecurrenceError } from "./rrule";

/** Things other members do that a `shared-activity` reminder can announce. */
export type SharedActivity = "drew" | "finished" | "added-item";

/** What sets a reminder off (plan.md §7.1). */
export type ReminderTrigger =
  | {
      kind: "schedule";
      /** Subset of RFC 5545; see `parseRRule`. Time of day comes from BYHOUR and BYMINUTE. */
      rrule: string;
      /** IANA zone the rule's times are in. */
      timezone: string;
      /** First possible local date (`YYYY-MM-DD`); required when the rule has an INTERVAL above 1. */
      startsOn?: string;
    }
  | { kind: "in-hand-too-long"; after: Duration }
  | { kind: "bucket-reopens" }
  | { kind: "cycle-complete" }
  | { kind: "running-low"; below: number }
  | { kind: "shared-activity"; events: SharedActivity[] };

/** A reminder, stored in the personal library document, never in the bucket (plan.md §7). */
export interface BucketReminder {
  /** Unique id. */
  id: string;
  /** The bucket it watches. */
  bucketId: string;
  /** Disabled reminders never fire. */
  enabled: boolean;
  /** Custom notification text. */
  label?: string;
  /** What sets it off. */
  trigger: ReminderTrigger;
  /** Just tell me, or draw for me and tell me the result. */
  action: "notify" | "draw-for-me";
  /** Where to deliver it. */
  delivery: { desktop: boolean; webPush: boolean; sound: boolean };
  /** Local `HH:MM` window in which notifications are held, then delivered when it ends. */
  quietHours?: { start: string; end: string };
  /** Snooze choices offered with the notification. */
  snoozeOptions: Duration[];
  /** Fire nothing after this instant. */
  expiresAt?: string;
}

/** One time a reminder should fire. */
export interface FireTime {
  /** The reminder. */
  reminderId: string;
  /** Its bucket. */
  bucketId: string;
  /** When to deliver: the scheduled time, moved to the end of quiet hours if it fell inside them. */
  at: string;
  /** When the trigger happened or is due, before quiet hours. */
  scheduledAt: string;
  /** What the reminder asks for. */
  action: BucketReminder["action"];
  /** The item concerned, for `in-hand-too-long` and `shared-activity`. */
  itemId?: string;
  /** What happened, for `shared-activity`. */
  activity?: SharedActivity;
}

/** A reminder that could not be evaluated, so the UI can tell its owner. */
export interface ReminderProblem {
  /** The reminder. */
  reminderId: string;
  /** What is wrong with it. */
  reason: RecurrenceError["reason"] | "invalid-quiet-hours";
}

/** What `nextFireTimes` needs to know about the moment. */
export interface FireQuery {
  /** The library's owner; reminders are personal, so "in hand" and "others" are relative to them. */
  memberId: string;
  /** Current time. */
  now: Date;
  /** Only triggers after this instant are returned, so a caller that was asleep still sees what it missed. */
  since: Date;
  /** IANA zone for quiet hours. */
  timeZone: string;
}

/** Result of {@link nextFireTimes}. */
export interface FireTimes {
  /** Times to fire, earliest first. Entries at or before `now` are due now. */
  times: FireTime[];
  /** Reminders that could not be evaluated. */
  problems: ReminderProblem[];
}

const TIME_OF_DAY = /^([01]\d|2[0-3]):([0-5]\d)$/;

function latestActivity(bucket: Bucket): string {
  return bucket.events.reduce(
    (latest, e) => (Date.parse(e.at) > Date.parse(latest) ? e.at : latest),
    bucket.createdAt,
  );
}

/** Moves a time out of quiet hours, to the moment they end. */
function afterQuietHours(
  reminder: BucketReminder,
  scheduled: Date,
  timeZone: string,
): { ok: true; at: Date } | { ok: false; reason: ReminderProblem["reason"] } {
  const quiet = reminder.quietHours;
  if (!quiet) return { ok: true, at: scheduled };
  const start = TIME_OF_DAY.exec(quiet.start);
  const end = TIME_OF_DAY.exec(quiet.end);
  if (!start || !end) return { ok: false, reason: "invalid-quiet-hours" };
  const startMin = Number(start[1]) * 60 + Number(start[2]);
  const endMin = Number(end[1]) * 60 + Number(end[2]);
  if (startMin === endMin) return { ok: true, at: scheduled };
  const minute = minutesOfDay(timeZone, scheduled);
  if (minute === undefined) return { ok: false, reason: "invalid-timezone" };
  const inside =
    startMin < endMin
      ? minute >= startMin && minute < endMin
      : minute >= startMin || minute < endMin;
  if (!inside) return { ok: true, at: scheduled };
  const release = nextOccurrence(
    {
      freq: "DAILY",
      interval: 1,
      byDay: [],
      byMonthDay: [],
      hour: Number(end[1]),
      minute: Number(end[2]),
    },
    undefined,
    timeZone,
    scheduled,
  );
  return release.ok && release.at
    ? { ok: true, at: release.at }
    : { ok: false, reason: "invalid-timezone" };
}

interface Candidate {
  at: Date;
  itemId?: string;
  activity?: SharedActivity;
}

function candidates(
  reminder: BucketReminder,
  bucket: Bucket,
  query: FireQuery,
): Candidate[] | ReminderProblem["reason"] {
  const { trigger } = reminder;
  const { memberId, now } = query;
  switch (trigger.kind) {
    case "schedule": {
      const parsed = parseRRule(trigger.rrule);
      if (!parsed.ok) return parsed.reason;
      const next = nextOccurrence(parsed.rule, trigger.startsOn, trigger.timezone, query.since);
      if (!next.ok) return next.reason;
      return next.at ? [{ at: next.at }] : [];
    }
    case "in-hand-too-long":
      return deriveItems(bucket, now)
        .filter((s) => s.status === "hand" && s.heldBy === memberId && s.heldSince !== null)
        .map((s) => ({
          at: new Date(Date.parse(s.heldSince ?? "") + durationToMs(trigger.after)),
          itemId: s.item.id,
        }));
    case "bucket-reopens": {
      // Only a cooldown has a known end; a lock ends when someone acts, which is an event, not a time.
      const check = checkDraw(bucket, memberId, now);
      return !check.ok && check.reason === "all-cooling-down"
        ? [{ at: new Date(check.opensAt) }]
        : [];
    }
    case "cycle-complete": {
      if (bucket.rules.noRepeat === "off") return [];
      const check = checkDraw(bucket, memberId, now);
      return check.ok && check.needsCycleReset ? [{ at: new Date(latestActivity(bucket)) }] : [];
    }
    case "running-low": {
      const eligible = deriveItems(bucket, now).filter(
        (s) => s.status === "in" && !s.item.archived,
      ).length;
      return eligible < trigger.below ? [{ at: new Date(latestActivity(bucket)) }] : [];
    }
    case "shared-activity": {
      const found: Candidate[] = [];
      const wanted = new Set(trigger.events);
      for (const event of bucket.events) {
        if (event.memberId === memberId) continue;
        const activity =
          event.kind === "drawn" ? "drew" : event.kind === "done" ? "finished" : undefined;
        if (activity && wanted.has(activity))
          found.push({ at: new Date(event.at), itemId: event.itemId, activity });
      }
      if (wanted.has("added-item")) {
        for (const item of Object.values(bucket.items)) {
          if (item.createdBy !== memberId)
            found.push({ at: new Date(item.createdAt), itemId: item.id, activity: "added-item" });
        }
      }
      return found;
    }
  }
}

/**
 * Works out when reminders should fire (plan.md §7.2). Platform schedulers call this and turn
 * the result into notifications.
 *
 * Pure. `schedule` reminders give their next occurrence after `since`. The other triggers are
 * read from the buckets' current state and history. Limits: `bucket-reopens` knows only cooldowns
 * that are still running; `cycle-complete` and `running-low` fire at the time of the latest
 * activity while their condition holds, so callers must remember what they already fired
 * (the "fired" marker, plan.md §7.2) and pass it back through `since`.
 *
 * @param reminders - The user's reminders.
 * @param buckets - Their buckets by id; reminders for missing buckets are skipped.
 * @param query - Who, when, and from which instant to look.
 * @returns Fire times earliest first, plus any reminders that could not be evaluated.
 */
export function nextFireTimes(
  reminders: readonly BucketReminder[],
  buckets: Readonly<Record<string, Bucket>>,
  query: FireQuery,
): FireTimes {
  const times: FireTime[] = [];
  const problems: ReminderProblem[] = [];
  for (const reminder of reminders) {
    const bucket = buckets[reminder.bucketId];
    if (!reminder.enabled || !bucket) continue;
    const found = candidates(reminder, bucket, query);
    if (typeof found === "string") {
      problems.push({ reminderId: reminder.id, reason: found });
      continue;
    }
    for (const c of found) {
      if (c.at.getTime() <= query.since.getTime()) continue;
      const delivery = afterQuietHours(reminder, c.at, query.timeZone);
      if (!delivery.ok) {
        problems.push({ reminderId: reminder.id, reason: delivery.reason });
        break;
      }
      if (
        reminder.expiresAt !== undefined &&
        delivery.at.getTime() > Date.parse(reminder.expiresAt)
      )
        continue;
      const time: FireTime = {
        reminderId: reminder.id,
        bucketId: reminder.bucketId,
        at: delivery.at.toISOString(),
        scheduledAt: c.at.toISOString(),
        action: reminder.action,
      };
      if (c.itemId !== undefined) time.itemId = c.itemId;
      if (c.activity !== undefined) time.activity = c.activity;
      times.push(time);
    }
  }
  times.sort(
    (a, b) =>
      Date.parse(a.at) - Date.parse(b.at) ||
      (a.reminderId < b.reminderId ? -1 : a.reminderId > b.reminderId ? 1 : 0),
  );
  return { times, problems };
}

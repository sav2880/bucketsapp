// SPDX-License-Identifier: Apache-2.0

import { duration, durationToMs, type Duration } from "../duration";
import type { Bucket } from "../model/types";
import { autoReturnOf, replayEvents, seedStates, sortEvents, toBaseline } from "./derive";

/** How much full history to keep by default (plan.md §5). */
export const DEFAULT_COMPACTION_HORIZON: Duration = duration(365, "days");

/**
 * Chooses the instant before which history may be folded away.
 *
 * Rounded down to the start of a UTC month so that devices compacting on different days agree on
 * the same boundary; two devices that compact concurrently then write identical results, and
 * merging them is harmless.
 *
 * @param now - Current time.
 * @param horizon - How much recent history to keep.
 * @returns The first instant of the month containing `now - horizon`.
 */
export function compactionCutoff(now: Date, horizon: Duration = DEFAULT_COMPACTION_HORIZON): Date {
  const target = new Date(now.getTime() - durationToMs(horizon));
  return new Date(Date.UTC(target.getUTCFullYear(), target.getUTCMonth(), 1));
}

/**
 * Folds events older than the horizon into the bucket's baseline and removes them.
 *
 * Deterministic: the same bucket and cutoff always give the same result. Deriving item state
 * afterwards gives exactly what it gave before, because the baseline is the replay state at the
 * cutoff. One limit: an event that reaches the bucket later (from a device that was offline for
 * longer than the horizon) with a time before the cutoff is replayed on top of the baseline, not
 * in its true place. Like all commands this mutates `bucket` so it can run inside `change()`.
 *
 * @param bucket - Bucket to compact.
 * @param now - Current time.
 * @param horizon - How much recent history to keep; defaults to a year.
 * @returns How many events were removed.
 */
export function compactHistory(
  bucket: Bucket,
  now: Date,
  horizon: Duration = DEFAULT_COMPACTION_HORIZON,
): number {
  const cutoff = compactionCutoff(now, horizon);
  if (bucket.baseline && Date.parse(bucket.baseline.through) >= cutoff.getTime()) return 0;
  const old = sortEvents(bucket.events.filter((e) => Date.parse(e.at) < cutoff.getTime()));
  if (old.length === 0) return 0;

  const states = seedStates(bucket);
  replayEvents(states, old, autoReturnOf(bucket));
  bucket.baseline = toBaseline(states, cutoff);

  const remove = new Set(old.map((e) => e.id));
  for (let i = bucket.events.length - 1; i >= 0; i--) {
    const event = bucket.events[i];
    if (event && remove.has(event.id)) bucket.events.splice(i, 1);
  }
  return old.length;
}

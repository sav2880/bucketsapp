// SPDX-License-Identifier: Apache-2.0

import { durationToMs } from "../duration";
import type {
  Bucket,
  BucketBaseline,
  BucketRules,
  DrawEvent,
  Item,
  ItemBaseline,
} from "../model/types";

/** Where an item is right now. Derived from events, never stored (AGENTS.md §8). */
export type ItemStatus = "in" | "hand" | "cooling" | "done";

/** Everything the draw rules and the UI need to know about one item. */
export interface ItemState {
  /** The item itself. */
  item: Item;
  /** Where it is: in the bucket, in someone's hand, resting, or finished for good. */
  status: ItemStatus;
  /** Member holding it, while in hand. */
  heldBy: string | null;
  /** When it was drawn, while in hand. */
  heldSince: string | null;
  /** Last time it was drawn. */
  lastDrawnAt: string | null;
  /** Last time it was finished. */
  lastDoneAt: string | null;
  /** How many times it has been drawn. */
  timesDrawn: number;
  /** How many times it has been finished. */
  timesDone: number;
  /** When its rest ends, if it was returned with a cooldown. */
  cooldownUntil: string | null;
  /** Whether it has had its turn in the current cycle. */
  drawnThisCycle: boolean;
  /** Steps finished out of steps in total. */
  stepsProgress: { done: number; total: number };
}

/** Mutable replay state for one item; times are epoch ms. */
export interface Working {
  item: Item;
  status: "in" | "hand" | "done";
  heldBy: string | null;
  heldSince: number | null;
  lastDrawnAt: number | null;
  lastDoneAt: number | null;
  timesDrawn: number;
  timesDone: number;
  cooldownUntil: number | null;
  drawnThisCycle: boolean;
  /** Value of `drawnThisCycle` before the latest draw, so a toss-back can undo it. */
  prevDrawnThisCycle: boolean;
}

const iso = (ms: number | null): string | null => (ms === null ? null : new Date(ms).toISOString());
const ms = (text: string | null): number | null => (text === null ? null : Date.parse(text));

/**
 * Puts events in a stable order: by time, then by id.
 *
 * Devices append concurrently and merge later, so replay must not depend on arrival order.
 *
 * @param events - Events in any order.
 * @returns A new, sorted array.
 */
export function sortEvents(events: readonly DrawEvent[]): DrawEvent[] {
  return events
    .map((event) => ({ event, at: Date.parse(event.at) }))
    .sort((a, b) => a.at - b.at || (a.event.id < b.event.id ? -1 : a.event.id > b.event.id ? 1 : 0))
    .map(({ event }) => event);
}

/**
 * Starts a replay: every item untouched, or as the compaction baseline left it.
 *
 * @param bucket - The bucket.
 * @returns One working state per item, in bucket order.
 */
export function seedStates(bucket: Bucket): Map<string, Working> {
  const states = new Map<string, Working>();
  for (const id of bucket.itemOrder) {
    const item = bucket.items[id];
    if (!item) continue;
    const base = bucket.baseline?.items[id];
    states.set(id, {
      item,
      status: base?.status ?? "in",
      heldBy: base?.heldBy ?? null,
      heldSince: ms(base?.heldSince ?? null),
      lastDrawnAt: ms(base?.lastDrawnAt ?? null),
      lastDoneAt: ms(base?.lastDoneAt ?? null),
      timesDrawn: base?.timesDrawn ?? 0,
      timesDone: base?.timesDone ?? 0,
      cooldownUntil: ms(base?.cooldownUntil ?? null),
      drawnThisCycle: base?.drawnThisCycle ?? false,
      prevDrawnThisCycle: base?.prevDrawnThisCycle ?? false,
    });
  }
  return states;
}

/**
 * Applies events, already in order, to a replay.
 *
 * Rules for conflicting events from different devices (plan.md §5, §9):
 * - events for items that no longer exist are skipped, so deleting an item never breaks history;
 * - a draw of an item that is already in hand is ignored, so the earliest draw wins;
 * - finishing or tossing back an item that is not in hand is ignored, so repeats are harmless.
 *
 * @param states - Replay state from {@link seedStates}; changed in place.
 * @param events - Events in {@link sortEvents} order.
 */
export function replayEvents(states: Map<string, Working>, events: readonly DrawEvent[]): void {
  for (const event of events) {
    const at = Date.parse(event.at);
    if (event.kind === "cycle-reset") {
      for (const s of states.values()) s.drawnThisCycle = false;
      continue;
    }
    const s = states.get(event.itemId);
    if (!s) continue;
    if (event.kind === "drawn") {
      if (s.status !== "in") continue;
      s.prevDrawnThisCycle = s.drawnThisCycle;
      s.status = "hand";
      s.heldBy = event.memberId;
      s.heldSince = at;
      s.lastDrawnAt = at;
      s.timesDrawn += 1;
      s.drawnThisCycle = true;
    } else if (s.status === "hand") {
      s.heldBy = null;
      s.heldSince = null;
      if (event.kind === "done") {
        s.timesDone += 1;
        s.lastDoneAt = at;
        if (event.onDone === "remove") {
          s.status = "done";
        } else {
          s.status = "in";
          s.cooldownUntil = event.cooldown ? at + durationToMs(event.cooldown) : null;
        }
      } else {
        // tossed-back: gives the turn back unless the rule in force then said it counts.
        s.status = "in";
        if (!event.countsAsDrawn) s.drawnThisCycle = s.prevDrawnThisCycle;
      }
    }
  }
}

/**
 * Freezes a replay into the stored form used by compaction.
 *
 * @param states - Replay state.
 * @param through - Events strictly before this instant are folded in.
 * @returns The baseline to store on the bucket.
 */
export function toBaseline(states: ReadonlyMap<string, Working>, through: Date): BucketBaseline {
  const items: Record<string, ItemBaseline> = {};
  for (const [id, s] of states) {
    items[id] = {
      status: s.status,
      heldBy: s.heldBy,
      heldSince: iso(s.heldSince),
      lastDrawnAt: iso(s.lastDrawnAt),
      lastDoneAt: iso(s.lastDoneAt),
      timesDrawn: s.timesDrawn,
      timesDone: s.timesDone,
      cooldownUntil: iso(s.cooldownUntil),
      drawnThisCycle: s.drawnThisCycle,
      prevDrawnThisCycle: s.prevDrawnThisCycle,
    };
  }
  return { through: through.toISOString(), items };
}

/**
 * Replays a bucket's history to work out where every item is.
 *
 * Pure. Events are replayed in time order whatever order they arrived in, on top of the
 * compaction baseline if there is one. See {@link replayEvents} for how conflicting events
 * from different devices resolve.
 *
 * @param bucket - The bucket to inspect.
 * @param now - Current time; decides which returned items are still resting.
 * @returns One state per item, in the bucket's item order.
 */
export function deriveItems(bucket: Bucket, now: Date): ItemState[] {
  const states = seedStates(bucket);
  replayEvents(states, sortEvents(bucket.events));
  const nowMs = now.getTime();
  return [...states.values()].map((s) => ({
    item: s.item,
    status:
      s.status === "in" && s.cooldownUntil !== null && s.cooldownUntil > nowMs
        ? "cooling"
        : s.status,
    heldBy: s.heldBy,
    heldSince: iso(s.heldSince),
    lastDrawnAt: iso(s.lastDrawnAt),
    lastDoneAt: iso(s.lastDoneAt),
    timesDrawn: s.timesDrawn,
    timesDone: s.timesDone,
    cooldownUntil: iso(s.cooldownUntil),
    drawnThisCycle: s.drawnThisCycle,
    stepsProgress: {
      done: s.item.steps.filter((step) => step.done).length,
      total: s.item.steps.length,
    },
  }));
}

/**
 * Whether a finished item has waited long enough to rejoin the pool early.
 *
 * @param state - The item's derived state.
 * @param rules - The bucket's rules.
 * @param now - Current time.
 * @returns `true` when `cycleResetAfter` is set and has passed since the item was last finished.
 */
export function isStale(state: ItemState, rules: Readonly<BucketRules>, now: Date): boolean {
  if (!rules.cycleResetAfter || state.lastDoneAt === null) return false;
  return now.getTime() - Date.parse(state.lastDoneAt) >= durationToMs(rules.cycleResetAfter);
}

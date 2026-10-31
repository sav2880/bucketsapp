// SPDX-License-Identifier: Apache-2.0

import { canDraw } from "../model/commands";
import type { Bucket, DrawEvent, Item } from "../model/types";
import { randomFloat, type Rng } from "../random/rng";
import { deriveItems, isStale, type ItemState } from "./derive";

/** How much more likely an item still waiting for its turn is to come up (plan.md §6.2 step 5). */
export const FAVOR_UNDRAWN_FACTOR = 3;

const DAY_MS = 86_400_000;

/** Why a draw was refused, with what the UI needs to explain it (plan.md §6.2). */
export type DrawRefusal =
  | { ok: false; reason: "not-permitted" }
  | { ok: false; reason: "locked"; holding: Item[] }
  | { ok: false; reason: "hand-full"; holding: Item[] }
  | { ok: false; reason: "empty"; doneCount: number }
  | { ok: false; reason: "all-cooling-down"; opensAt: string };

/** What a draw would do, before any randomness. */
export type DrawCheck =
  | DrawRefusal
  | {
      ok: true;
      /** How many items to pull: `drawCount`, capped by room in hand. */
      count: number;
      /** Items that may be chosen. */
      candidates: ItemState[];
      /** The cycle is complete, so a `cycle-reset` event comes first. */
      needsCycleReset: boolean;
    };

/** Result of {@link draw}. */
export type DrawResult =
  | DrawRefusal
  | {
      ok: true;
      /** Events to append, in order: an optional `cycle-reset`, then one `drawn` per item. */
      events: DrawEvent[];
      /** Ids of the drawn items, in the order drawn. */
      itemIds: string[];
      /** Whether a new cycle started with this draw. */
      cycleReset: boolean;
    };

/** Everything {@link draw} needs from the outside world. */
export interface DrawRequest {
  /** Member drawing. */
  memberId: string;
  /** Device they are on. */
  deviceId: string;
  /** Current time; injected so results are reproducible. */
  now: Date;
  /** Random source; use `createSeededRng` in tests. */
  rng: Rng;
  /** Produces a fresh unique id for each event. */
  makeId: () => string;
}

function byAvailability(states: ItemState[]): {
  holding: ItemState[];
  available: ItemState[];
  cooling: ItemState[];
  done: number;
} {
  const live = states.filter((s) => !s.item.archived);
  return {
    holding: states.filter((s) => s.status === "hand"),
    available: live.filter((s) => s.status === "in"),
    cooling: live.filter((s) => s.status === "cooling"),
    done: live.filter((s) => s.status === "done").length,
  };
}

/**
 * Works out whether a member may draw now, and from which items (plan.md §6.2 steps 1–4).
 *
 * Pure.
 *
 * @param bucket - The bucket to draw from.
 * @param memberId - Member drawing.
 * @param now - Current time.
 * @returns A refusal the UI can explain, or the candidates and how many to pull.
 */
export function checkDraw(bucket: Bucket, memberId: string, now: Date): DrawCheck {
  if (!canDraw(bucket.members[memberId]?.role)) return { ok: false, reason: "not-permitted" };
  const { rules } = bucket;
  const states = deriveItems(bucket, now);
  const { holding, available, cooling, done } = byAvailability(states);

  const mine =
    rules.inHandScope === "per-member" ? holding.filter((s) => s.heldBy === memberId) : holding;
  if (rules.lockUntilResolved && mine.length > 0) {
    return { ok: false, reason: "locked", holding: mine.map((s) => s.item) };
  }
  const room = rules.maxInHand - mine.length;
  if (room <= 0) return { ok: false, reason: "hand-full", holding: mine.map((s) => s.item) };

  if (available.length === 0) {
    const resting = cooling.map((s) => s.cooldownUntil).filter((t): t is string => t !== null);
    if (resting.length > 0) {
      const opensAt = resting.reduce((a, b) => (Date.parse(a) <= Date.parse(b) ? a : b));
      return { ok: false, reason: "all-cooling-down", opensAt };
    }
    return { ok: false, reason: "empty", doneCount: done };
  }

  let candidates = available;
  let needsCycleReset = false;
  if (rules.noRepeat === "until-cycle-complete") {
    const fresh = available.filter((s) => !s.drawnThisCycle || isStale(s, rules, now));
    if (fresh.length > 0) candidates = fresh;
    else needsCycleReset = true;
  }
  return { ok: true, count: Math.min(rules.drawCount, room), candidates, needsCycleReset };
}

/**
 * Chooses `n` entries without replacement, favoring higher weights (Efraimidis–Spirakis).
 *
 * Each entry gets the key `u^(1/w)` with `u` uniform in (0, 1]; the `n` largest keys win. This
 * gives the same odds as repeatedly drawing one weighted item and removing it, in one pass.
 * Entries with weight 0 or less are never chosen.
 *
 * @param entries - Candidates and their weights.
 * @param n - How many to choose.
 * @param rng - Random source.
 * @returns The chosen entries, best key first.
 */
export function weightedSample<T extends { weight: number }>(
  entries: readonly T[],
  n: number,
  rng: Rng,
): T[] {
  return entries
    .filter((entry) => entry.weight > 0)
    .map((entry, index) => ({ entry, index, key: (1 - randomFloat(rng)) ** (1 / entry.weight) }))
    .sort((a, b) => b.key - a.key || a.index - b.index)
    .slice(0, n)
    .map(({ entry }) => entry);
}

/**
 * Chance weight of one candidate (plan.md §6.2 step 5).
 *
 * @param state - The candidate.
 * @param bucket - The bucket, for its rules.
 * @param now - Current time.
 * @param afterReset - A new cycle is starting, so nobody is "undrawn" any more.
 * @returns A non-negative weight.
 */
export function weightOf(state: ItemState, bucket: Bucket, now: Date, afterReset: boolean): number {
  const { rules } = bucket;
  let weight = 1;
  if (rules.selection === "weighted") {
    weight = Math.max(0, state.item.weight);
  } else if (rules.selection === "aging") {
    const since = Date.parse(state.lastDrawnAt ?? state.item.createdAt);
    const days = Math.max(0, (now.getTime() - since) / DAY_MS);
    weight = Math.max(0, state.item.weight) * (1 + Math.max(0, rules.agingRatePerDay ?? 0) * days);
  }
  if (rules.favorUndrawn && !afterReset && !state.drawnThisCycle) weight *= FAVOR_UNDRAWN_FACTOR;
  return weight;
}

/**
 * Round robin: the item that has waited longest goes first; never-drawn items beat all others,
 * and ties go to the earlier place in the bucket.
 */
function roundRobin(candidates: readonly ItemState[], n: number): ItemState[] {
  return candidates
    .map((state, index) => ({
      state,
      index,
      last: state.lastDrawnAt === null ? -Infinity : Date.parse(state.lastDrawnAt),
    }))
    .sort((a, b) => (a.last === b.last ? a.index - b.index : a.last < b.last ? -1 : 1))
    .slice(0, n)
    .map(({ state }) => state);
}

/**
 * Draws items from a bucket according to its rules.
 *
 * Pure: never mutates `bucket`. Returns the events to append (see `applyEvents`), or a typed
 * refusal the UI can explain.
 *
 * @param bucket - The bucket to draw from.
 * @param request - Who is drawing, plus time, randomness and id source.
 * @returns New `drawn` events, or a refusal with its reason.
 *
 * @example
 * ```ts
 * const result = draw(bucket, { memberId, deviceId, now: new Date(), rng, makeId });
 * if (result.ok) applyEvents(bucket, result.events);
 * ```
 */
export function draw(bucket: Bucket, request: DrawRequest): DrawResult {
  const { memberId, deviceId, now, rng, makeId } = request;
  const check = checkDraw(bucket, memberId, now);
  if (!check.ok) return check;

  let chosen: ItemState[];
  if (bucket.rules.selection === "round-robin") {
    chosen = roundRobin(check.candidates, check.count);
  } else {
    let entries = check.candidates.map((state) => ({
      state,
      weight: weightOf(state, bucket, now, check.needsCycleReset),
    }));
    // All weights zero (every item set to 0): fall back to chance rather than refuse a draw.
    if (entries.every((e) => e.weight <= 0)) entries = entries.map((e) => ({ ...e, weight: 1 }));
    chosen = weightedSample(entries, check.count, rng).map((e) => e.state);
  }

  const at = now.toISOString();
  const events: DrawEvent[] = [];
  if (check.needsCycleReset)
    events.push({ id: makeId(), itemId: "", kind: "cycle-reset", at, memberId, deviceId });
  for (const { item } of chosen) {
    events.push({ id: makeId(), itemId: item.id, kind: "drawn", at, memberId, deviceId });
  }
  return {
    ok: true,
    events,
    itemIds: chosen.map((s) => s.item.id),
    cycleReset: check.needsCycleReset,
  };
}

/**
 * Builds a `drawn` event while skipping every rule. For seeding history in tests and demos.
 *
 * @param itemId - The item drawn.
 * @param request - Who, when and the id source; `rng` is unused.
 * @returns The event.
 */
export function recordDraw(itemId: string, request: Omit<DrawRequest, "rng">): DrawEvent {
  return {
    id: request.makeId(),
    itemId,
    kind: "drawn",
    at: request.now.toISOString(),
    memberId: request.memberId,
    deviceId: request.deviceId,
  };
}

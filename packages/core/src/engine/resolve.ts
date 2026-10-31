// SPDX-License-Identifier: Apache-2.0

import { canDraw, canEdit } from "../model/commands";
import type { Bucket, DrawEvent } from "../model/types";
import { deriveItems } from "./derive";

/** Why an item could not be finished or tossed back. */
export type ResolveRefusal =
  | { ok: false; reason: "not-permitted" }
  | { ok: false; reason: "not-in-hand" }
  | { ok: false; reason: "steps-incomplete"; remaining: number };

/** Result of {@link resolve}. */
export type ResolveResult = { ok: true; event: DrawEvent } | ResolveRefusal;

/** Input for {@link resolve}. */
export interface ResolveRequest {
  /** The item being resolved. */
  itemId: string;
  /** Finish it, or give it back unfinished. */
  kind: "done" | "tossed-back";
  /** Member resolving it. */
  memberId: string;
  /** Device they are on. */
  deviceId: string;
  /** Current time. */
  now: Date;
  /** Produces the event id. */
  makeId: () => string;
  /** Toss-back reason visible to other members. */
  note?: string;
  /** Toss-back reason already encrypted for the author's devices only. */
  privateNote?: string;
}

/**
 * Builds the event that finishes an item or tosses it back.
 *
 * Pure. The holder may resolve their own item; owners and editors may resolve anyone's. The event
 * snapshots the rules in force, so later rule edits never rewrite history.
 *
 * @param bucket - The bucket.
 * @param request - What to do, and who is doing it.
 * @returns The event to append, or a refusal.
 */
export function resolve(bucket: Bucket, request: ResolveRequest): ResolveResult {
  const { itemId, kind, memberId, deviceId, now, makeId, note, privateNote } = request;
  const role = bucket.members[memberId]?.role;
  if (!canDraw(role)) return { ok: false, reason: "not-permitted" };
  const state = deriveItems(bucket, now).find((s) => s.item.id === itemId);
  if (state?.status !== "hand") return { ok: false, reason: "not-in-hand" };
  if (state.heldBy !== memberId && !canEdit(role)) return { ok: false, reason: "not-permitted" };

  const { rules } = bucket;
  const event: DrawEvent = {
    id: makeId(),
    itemId,
    kind,
    at: now.toISOString(),
    memberId,
    deviceId,
  };
  if (kind === "done") {
    const remaining = state.stepsProgress.total - state.stepsProgress.done;
    if (rules.requireAllSteps && remaining > 0)
      return { ok: false, reason: "steps-incomplete", remaining };
    event.onDone = rules.onDone;
    if (rules.onDone === "return" && rules.cooldown) event.cooldown = { ...rules.cooldown };
  } else {
    event.countsAsDrawn = rules.tossBackCountsAsDrawn;
    if (note !== undefined) event.note = note;
    if (privateNote !== undefined) event.privateNote = privateNote;
  }
  return { ok: true, event };
}

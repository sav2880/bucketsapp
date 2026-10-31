// SPDX-License-Identifier: Apache-2.0

import type { DrawRequest } from "../src/engine/draw";
import { applyEvents, createBucket } from "../src/model/commands";
import { PRESETS } from "../src/model/presets";
import type {
  Bucket,
  BucketPresetId,
  BucketRules,
  DrawEvent,
  MemberRole,
} from "../src/model/types";
import type { Rng } from "../src/random/rng";

/** Fixed start time for scenarios: 2026-09-30 09:00 UTC. */
export const T0 = Date.UTC(2026, 8, 30, 9);
/** One hour in milliseconds. */
export const HOUR = 3_600_000;
/** One day in milliseconds. */
export const DAY = 24 * HOUR;

/**
 * Makes a deterministic id source.
 *
 * @param prefix - Start of every id.
 * @returns A function giving `prefix-1`, `prefix-2`, …
 */
export function idMaker(prefix = "id"): () => string {
  let n = 0;
  return () => `${prefix}-${String(++n)}`;
}

/** Options for {@link makeBucket}. */
export interface BucketOptions {
  /** Preset to start from; defaults to `"grab-and-go"`. */
  preset?: Exclude<BucketPresetId, "custom">;
  /** Overrides applied to the preset's rules. */
  rules?: Partial<BucketRules>;
  /** Number of items, ids `i0`, `i1`, …; or one weight per item. */
  items?: number | number[];
  /** Extra members by member id. */
  members?: Record<string, MemberRole>;
}

/**
 * Builds a bucket ready for draw scenarios. The owner is `me`; items were created 30 days
 * before {@link T0}.
 *
 * @param options - What to build.
 * @returns The bucket.
 */
export function makeBucket(options: BucketOptions = {}): Bucket {
  const bucket = createBucket(
    { name: "Test", preset: options.preset ?? "grab-and-go", ownerName: "Me" },
    { memberId: "me", now: new Date(T0 - 30 * DAY), makeId: () => "bucket" },
  );
  bucket.rules = { ...PRESETS[options.preset ?? "grab-and-go"].rules, ...options.rules };
  const weights = Array.isArray(options.items)
    ? options.items
    : Array<number>(options.items ?? 3).fill(1);
  weights.forEach((weight, i) => {
    const id = `i${String(i)}`;
    bucket.items[id] = {
      id,
      title: `Item ${String(i)}`,
      tags: [],
      weight,
      steps: [],
      links: [],
      attachments: [],
      archived: false,
      createdBy: "me",
      createdAt: new Date(T0 - 30 * DAY).toISOString(),
    };
    bucket.itemOrder.push(id);
  });
  for (const [memberId, role] of Object.entries(options.members ?? {})) {
    bucket.members[memberId] = {
      memberId,
      displayName: memberId,
      role,
      devicePublicKeys: [],
      joinedAt: new Date(T0).toISOString(),
    };
  }
  return bucket;
}

/**
 * Builds a draw request.
 *
 * @param rng - Random source.
 * @param nowMs - Current time as epoch milliseconds.
 * @param makeId - Event id source.
 * @param memberId - Member drawing; defaults to `me`.
 * @returns The request.
 */
export function request(
  rng: Rng,
  nowMs: number,
  makeId: () => string,
  memberId = "me",
): DrawRequest {
  return { memberId, deviceId: "d1", now: new Date(nowMs), rng, makeId };
}

/**
 * Applies the events of a successful result, failing the test otherwise.
 *
 * @param bucket - Bucket to change.
 * @param result - A draw or resolve result.
 * @returns The ids drawn, or an empty list for a resolve.
 */
export function applyOk(
  bucket: Bucket,
  result:
    | { ok: true; events: DrawEvent[]; itemIds: string[] }
    | { ok: true; event: DrawEvent }
    | { ok: false; reason: string },
): string[] {
  if (!result.ok) throw new Error(`expected success, got ${result.reason}`);
  if ("event" in result) {
    applyEvents(bucket, [result.event]);
    return [];
  }
  applyEvents(bucket, result.events);
  return result.itemIds;
}

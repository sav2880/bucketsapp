// SPDX-License-Identifier: Apache-2.0

import type { DrawRefusal } from "@buckets/core";

/**
 * Where paper slips sit inside the bucket mouth: `[x, depth, rotation in degrees]`. Index 0 is
 * front and centre; later spots sit further back and lean more, so a full bucket looks crowded.
 * Ported from the prototype (plan.md §12.3).
 */
export const SLIP_SPOTS: readonly (readonly [number, number, number])[] = [
  [130, 0, -3],
  [106, 4, 7],
  [154, 3, -9],
  [90, 7, 12],
  [170, 6, -13],
  [118, 9, 4],
  [142, 8, -6],
  [98, 11, 15],
  [162, 10, -11],
  [124, 13, 2],
  [148, 12, -4],
  [134, 15, 9],
];

/** Most resting (cooling down) slips drawn; more would only crowd the picture. */
const MAX_RESTING = 3;

/** Height of the bucket mouth in drawing units; slips are measured up from here. */
const MOUTH_Y = 70;

/** One paper slip in the drawing. */
export interface SlipPlacement {
  /** Horizontal centre in drawing units. */
  x: number;
  /** Top edge in drawing units. */
  y: number;
  /** Lean in degrees. */
  rotation: number;
  /** True for an item that is cooling down: drawn greyed, with no coloured band. */
  resting: boolean;
}

/**
 * Works out where each slip goes. The fuller the bucket, the higher the slips poke out of it.
 * Slips come back to front, so the first one drawn in the list is behind the later ones.
 *
 * @param inCount - Items waiting to be drawn.
 * @param restingCount - Items cooling down.
 * @returns Slips to draw, back to front.
 */
export function slipLayout(inCount: number, restingCount: number): SlipPlacement[] {
  const shown = Math.min(Math.max(inCount, 0), SLIP_SPOTS.length);
  const fill = 6 + shown * 1.7;
  const slips: SlipPlacement[] = [];
  for (let i = 0; i < Math.min(Math.max(restingCount, 0), MAX_RESTING); i += 1) {
    const spot = SLIP_SPOTS[SLIP_SPOTS.length - 1 - i];
    if (spot) slips.push({ x: spot[0], y: 62, rotation: spot[2], resting: true });
  }
  for (let i = shown - 1; i >= 0; i -= 1) {
    const spot = SLIP_SPOTS[i];
    if (spot)
      slips.push({
        x: spot[0],
        y: MOUTH_Y - Math.max(6, fill + 8 - spot[1]),
        rotation: spot[2],
        resting: false,
      });
  }
  return slips;
}

/** The bucket's expressions. */
export type Mood = "idle" | "wow" | "happy" | "wait" | "sleep" | "no";

/** What the bucket looks like when nothing is animating. */
export interface BucketVisual {
  /** Whether the lid is on. */
  lidOn: boolean;
  /** The resting expression. */
  mood: Mood;
}

/**
 * Chooses the lid and the face from whether a draw is allowed. The lid means "not right now":
 * locked, hand full, everything cooling down, or no permission. An empty bucket is open but
 * has nothing to draw. Asleep means everything is resting; waiting means something has to be
 * finished first.
 *
 * @param refusal - Why drawing is refused, or `undefined` when it is allowed.
 * @returns The lid and the face.
 */
export function bucketVisual(refusal: DrawRefusal | undefined): BucketVisual {
  if (refusal === undefined || refusal.reason === "empty") return { lidOn: false, mood: "idle" };
  return { lidOn: true, mood: refusal.reason === "all-cooling-down" ? "sleep" : "wait" };
}

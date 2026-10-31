// SPDX-License-Identifier: Apache-2.0

import { duration, type Duration } from "../duration";
import type { BucketPresetId, BucketRules } from "./types";

/** The rules every preset starts from. */
export const BASE_RULES: Readonly<BucketRules> = Object.freeze({
  drawCount: 1,
  maxInHand: 1,
  inHandScope: "bucket",
  lockUntilResolved: false,
  onDone: "return",
  requireAllSteps: false,
  resetStepsOnReturn: true,
  noRepeat: "off",
  favorUndrawn: false,
  tossBackCountsAsDrawn: false,
  selection: "uniform",
  hideTitlesUntilDrawn: false,
  tossBackConfirm: "simple",
});

/** A named starting point for {@link BucketRules}. */
export interface Preset {
  /** Name shown to the user. */
  name: string;
  /** One-line description shown to the user. */
  summary: string;
  /** The complete rules. */
  rules: Readonly<BucketRules>;
}

/** Every preset except `"custom"` (plan.md §6.4). Values mirror `prototype/engine.js`. */
export const PRESETS: Readonly<Record<Exclude<BucketPresetId, "custom">, Preset>> = Object.freeze({
  "grab-and-go": {
    name: "Grab & Go",
    summary: "Pull one item, finish it, and it is gone.",
    rules: Object.freeze({
      ...BASE_RULES,
      onDone: "remove",
      lockUntilResolved: true,
      tossBackConfirm: "deliberate",
    }),
  },
  "rotation-pool": {
    name: "Rotation Pool",
    summary: "Everything gets a turn before anything repeats.",
    rules: Object.freeze({
      ...BASE_RULES,
      maxInHand: 2,
      noRepeat: "until-cycle-complete",
      cycleResetAfter: duration(30, "days"),
      favorUndrawn: true,
    }),
  },
  weighted: {
    name: "Weighted Bucket",
    summary: "Items you care about more come up more often.",
    rules: Object.freeze({ ...BASE_RULES, selection: "weighted", tossBackConfirm: "none" }),
  },
  simmer: {
    name: "Simmer Bucket",
    summary: "The longer an item waits, the likelier it is to come up.",
    rules: Object.freeze({
      ...BASE_RULES,
      selection: "aging",
      agingRatePerDay: 0.5,
      tossBackConfirm: "none",
    }),
  },
  "mystery-bag": {
    name: "Mystery Bag",
    summary: "You see an item's title only once you draw it.",
    rules: Object.freeze({
      ...BASE_RULES,
      hideTitlesUntilDrawn: true,
      lockUntilResolved: true,
      cooldown: duration(24, "hours"),
      tossBackConfirm: "deliberate",
    }),
  },
  "daily-draw": {
    name: "Daily Draw",
    summary: "A few items handed to you each day; leftovers go back overnight.",
    rules: Object.freeze({
      ...BASE_RULES,
      drawCount: 3,
      maxInHand: 3,
      autoReturnAt: "00:00",
    }),
  },
  "round-robin": {
    name: "Round Robin",
    summary: "Fair turns for everyone who shares the bucket.",
    rules: Object.freeze({
      ...BASE_RULES,
      selection: "round-robin",
      inHandScope: "per-member",
    }),
  },
  nested: {
    name: "Nested Buckets",
    summary: "Draw a category first, then an item inside it.",
    rules: BASE_RULES,
  },
});

function sameDuration(a: Duration | undefined, b: Duration | undefined): boolean {
  if (a === undefined || b === undefined) return a === b;
  return a.unit === b.unit && a.value === b.value;
}

/**
 * Compares two rule sets field by field.
 *
 * @param a - First rule set.
 * @param b - Second rule set.
 * @returns `true` when every rule is equal.
 */
export function rulesEqual(a: Readonly<BucketRules>, b: Readonly<BucketRules>): boolean {
  const keys = new Set([...Object.keys(a), ...Object.keys(b)]) as Set<keyof BucketRules>;
  for (const key of keys) {
    if (key === "cooldown" || key === "cycleResetAfter") {
      if (!sameDuration(a[key], b[key])) return false;
    } else if (a[key] !== b[key]) {
      return false;
    }
  }
  return true;
}

/**
 * Finds the preset whose rules equal `rules`.
 *
 * `nested` has the same rules as the base, so it matches only through its items; this
 * function returns the first match in table order and never returns `"nested"`.
 *
 * @param rules - Rules to look up.
 * @returns The preset id, or `"custom"` when none matches.
 */
export function matchPreset(rules: Readonly<BucketRules>): BucketPresetId {
  for (const [id, preset] of Object.entries(PRESETS) as [
    Exclude<BucketPresetId, "custom">,
    Preset,
  ][]) {
    if (id !== "nested" && rulesEqual(rules, preset.rules)) return id;
  }
  return "custom";
}

// SPDX-License-Identifier: Apache-2.0

import type { Bucket, DrawCheck, DrawRefusal, ResolveRefusal } from "@buckets/core";
import { t, tp } from "../i18n";

/**
 * Whether the title of an item still waiting in the bucket should be hidden (Mystery Bag).
 *
 * @param bucket - The bucket.
 * @param status - The item's status.
 * @returns `true` when the title must not be shown.
 */
export function titleHidden(bucket: Bucket, status: "in" | "hand" | "cooling" | "done"): boolean {
  return bucket.rules.hideTitlesUntilDrawn && (status === "in" || status === "cooling");
}

/**
 * Says why a draw is not possible, in words the user can act on (plan.md §6.2).
 *
 * @param refusal - The reason from `checkDraw` or `draw`.
 * @param when - Formats a time for the user, in their language and zone.
 * @returns One sentence.
 */
export function describeDrawRefusal(refusal: DrawRefusal, when: (iso: string) => string): string {
  switch (refusal.reason) {
    case "locked":
      return t("draw.hint.locked", { titles: refusal.holding.map((i) => i.title).join(", ") });
    case "hand-full":
      return t("draw.hint.handFull");
    case "empty":
      return t(refusal.doneCount > 0 ? "draw.hint.emptyDone" : "draw.hint.empty");
    case "all-cooling-down":
      return t("draw.hint.cooling", { when: when(refusal.opensAt) });
    case "not-permitted":
      return t("draw.hint.notPermitted");
  }
}

/**
 * Says why an item could not be finished or tossed back.
 *
 * @param refusal - The reason from `resolve`.
 * @returns One sentence.
 */
export function describeResolveRefusal(refusal: ResolveRefusal): string {
  switch (refusal.reason) {
    case "steps-incomplete":
      return tp("draw.stepsIncomplete", refusal.remaining, { remaining: refusal.remaining });
    case "not-in-hand":
      return t("draw.notInHand");
    case "not-permitted":
      return t("draw.hint.notPermitted");
  }
}

/**
 * The short line under the Draw button when a draw is possible: how many are waiting this
 * round, or how many slips are inside.
 *
 * @param bucket - The bucket.
 * @param check - The result of `checkDraw`, when it allows a draw.
 * @param inCount - Items waiting inside the bucket.
 * @returns One sentence.
 */
export function describeReady(
  bucket: Bucket,
  check: Extract<DrawCheck, { ok: true }>,
  inCount: number,
): string {
  if (bucket.rules.noRepeat === "until-cycle-complete") {
    if (check.needsCycleReset) return t("draw.ready.newRound");
    return t("draw.ready.round", {
      count: check.candidates.length,
      total: bucket.itemOrder.length,
    });
  }
  if (bucket.rules.hideTitlesUntilDrawn) return tp("draw.ready.mystery", inCount);
  return tp("draw.ready.items", inCount);
}

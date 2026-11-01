// SPDX-License-Identifier: Apache-2.0

import { t, tp } from "../i18n";

const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

/**
 * Describes a length of time roughly, the way a person would say it: "5 min", "3 h", "2 days".
 * Under a minute reads as "1 min" so it never says zero.
 *
 * @param ms - Milliseconds; the sign is ignored.
 * @returns Short text.
 */
export function formatSpan(ms: number): string {
  const abs = Math.abs(ms);
  if (abs < HOUR) return t("span.minutes", { count: Math.max(1, Math.round(abs / MINUTE)) });
  if (abs < DAY) return t("span.hours", { count: Math.round(abs / HOUR) });
  return tp("span.days", Math.round(abs / DAY));
}

// SPDX-License-Identifier: Apache-2.0

import type { ReactElement } from "react";
import { t } from "../i18n";

/** Props for {@link ProgressRing}. */
export interface ProgressRingProps {
  /** Steps finished. */
  done: number;
  /** Steps in all. */
  total: number;
}

const RADIUS = 7;
const CIRCUMFERENCE = 2 * Math.PI * RADIUS;

/**
 * A small ring that fills as steps are finished, with the count beside it.
 *
 * @param props - See {@link ProgressRingProps}.
 * @returns Nothing when there are no steps.
 */
export function ProgressRing({ done, total }: ProgressRingProps): ReactElement | null {
  if (total === 0) return null;
  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: "var(--space-1)",
        color: "var(--text-2)",
      }}
      aria-label={t("list.progressLabel", { done, total })}
      role="img"
    >
      <svg width="18" height="18" viewBox="0 0 18 18" aria-hidden="true" focusable="false">
        <circle
          cx="9"
          cy="9"
          r={RADIUS}
          fill="none"
          stroke="var(--fill-strong)"
          strokeWidth="2.5"
        />
        <circle
          cx="9"
          cy="9"
          r={RADIUS}
          fill="none"
          stroke="var(--enamel)"
          strokeWidth="2.5"
          strokeLinecap="round"
          strokeDasharray={`${String((done / total) * CIRCUMFERENCE)} ${String(CIRCUMFERENCE)}`}
          transform="rotate(-90 9 9)"
        />
      </svg>
      <span aria-hidden="true">{t("steps.progress", { done, total })}</span>
    </span>
  );
}

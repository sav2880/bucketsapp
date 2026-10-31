// SPDX-License-Identifier: Apache-2.0

import type { ReactElement } from "react";

/**
 * A plain bucket drawing in the bucket's own color. The animated art arrives in M3
 * (plan.md §15); this keeps the layout honest until then.
 *
 * @returns A decorative SVG, hidden from screen readers.
 */
export function BucketArt(): ReactElement {
  return (
    <svg
      width="96"
      height="84"
      viewBox="0 0 96 84"
      aria-hidden="true"
      focusable="false"
      data-testid="bucket-art"
    >
      <ellipse cx="48" cy="14" rx="38" ry="10" fill="var(--enamel)" opacity="0.55" />
      <path d="M10 14 L20 76 Q48 86 76 76 L86 14 Q48 28 10 14 Z" fill="var(--enamel)" />
      <path d="M14 14 Q48 -10 82 14" fill="none" stroke="var(--handle)" strokeWidth="3" />
    </svg>
  );
}

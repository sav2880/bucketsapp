// SPDX-License-Identifier: Apache-2.0

import type { ReactElement, Ref } from "react";
import { t, tp } from "../i18n";

/** Props for {@link DonePile}. */
export interface DonePileProps {
  /** How many items have been finished and left the bucket. */
  count: number;
  /** Called when the pile is pressed; the bucket pane shows the list. */
  onShow: () => void;
  /** Lets the draw animation find the pile to fly finished slips to. */
  pileRef?: Ref<HTMLButtonElement>;
}

/**
 * A small chip with the number of finished items. Finished slips fly to it on buckets that
 * remove items when they are done (plan.md §12.3).
 *
 * @param props - See {@link DonePileProps}.
 * @returns The chip.
 */
export function DonePile({ count, onShow, pileRef }: DonePileProps): ReactElement {
  return (
    <button
      ref={pileRef}
      type="button"
      className="bk-pile"
      onClick={onShow}
      aria-label={tp("pile.label", count)}
      data-testid="done-pile"
    >
      <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true" focusable="false">
        <rect x="3" y="9" width="10" height="4" rx="1" fill="currentColor" opacity="0.5" />
        <rect x="2" y="5" width="10" height="4" rx="1" fill="currentColor" opacity="0.75" />
        <rect x="4" y="1" width="9" height="4" rx="1" fill="currentColor" />
      </svg>
      <span aria-hidden="true">{t("pile.title")}</span>
      <span className="bk-pile-count" aria-hidden="true">
        {count}
      </span>
    </button>
  );
}

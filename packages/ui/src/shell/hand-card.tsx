// SPDX-License-Identifier: Apache-2.0

import { setStepDone, type ItemState } from "@buckets/core";
import type { ReactElement } from "react";
import { useActions } from "../app-environment";
import { t } from "../i18n";
import { formatSpan } from "./format-span";

/** Props for {@link HandCard}. */
export interface HandCardProps {
  /** The bucket this item is in. */
  bucketId: string;
  /** The item and its state; its status is `"hand"`. */
  state: ItemState;
  /** The current time, for "in hand for 2 h". */
  now: Date;
  /** Whether the current member holds it (and so can tick steps, finish and toss back). */
  mine: boolean;
  /** Name of the holder, shown when it is someone else. */
  holderName: string;
  /** Whether the current member may resolve it. */
  canResolve: boolean;
  /** Called for Done. */
  onDone: () => void;
  /** Called for Toss back. */
  onTossBack: () => void;
  /** Called when the user wants details. */
  onSelect: () => void;
  /** Just drawn and not shown yet: the slip is still on its way. */
  pending?: boolean;
  /** Shown, but the title stays hidden until the card flips (Mystery Bag). */
  concealed?: boolean;
  /** Tells the bucket where this card is, so slips can fly to it and copies can leave from it. */
  registerCard?: (itemId: string, element: HTMLElement | null) => void;
}

/**
 * An item that has been drawn, as a paper card with a stripe in the bucket's color: its title,
 * how long it has been in hand, notes, steps to tick off, and Done and Toss back.
 *
 * @param props - See {@link HandCardProps}.
 * @returns The card.
 */
export function HandCard({
  bucketId,
  state,
  now,
  mine,
  holderName,
  canResolve,
  onDone,
  onTossBack,
  onSelect,
  pending = false,
  concealed = false,
  registerCard,
}: HandCardProps): ReactElement {
  const actions = useActions();
  const { item } = state;
  const held = state.heldSince === null ? 0 : now.getTime() - Date.parse(state.heldSince);
  const doneSteps = item.steps.filter((step) => step.done).length;
  return (
    <li
      ref={(element) => {
        registerCard?.(item.id, element);
      }}
      className="bk-card"
      data-testid={`hand-${item.id}`}
      // While the slip is on its way, or the title is still hidden, the card can't be read,
      // reached or clicked; `inert` does all three.
      inert={pending || concealed}
      style={{ opacity: pending ? 0 : undefined }}
    >
      <h3 className="bk-card-title" style={{ color: concealed ? "transparent" : undefined }}>
        <button type="button" onClick={onSelect}>
          {item.title}
        </button>
      </h3>
      <p className="bk-card-meta">
        {held < 60_000 ? t("hand.justDrawn") : t("hand.heldFor", { span: formatSpan(held) })}
      </p>
      {!mine && <p className="bk-card-meta">{t("hand.heldBy", { name: holderName })}</p>}
      {item.notes !== "" && <p className="bk-card-notes">{item.notes}</p>}
      {item.steps.length > 0 && (
        <>
          <ul className="bk-card-steps">
            {item.steps.map((step) => (
              <li key={step.id}>
                <label>
                  <input
                    type="checkbox"
                    checked={step.done}
                    onChange={(e) => {
                      actions.run(bucketId, (bucket, ctx) =>
                        setStepDone(bucket, item.id, step.id, e.target.checked, ctx),
                      );
                    }}
                  />
                  {step.title}
                </label>
              </li>
            ))}
          </ul>
          <p className="bk-card-meta">
            {t("hand.stepsProgress", { done: doneSteps, total: item.steps.length })}
          </p>
        </>
      )}
      {canResolve && (
        <div className="bk-card-actions">
          <button type="button" className="bk-btn-done" onClick={onDone} data-testid="done">
            {t("hand.done")}
          </button>
          <button
            type="button"
            className="bk-btn-toss"
            onClick={onTossBack}
            data-testid="toss-back"
          >
            {t("hand.tossBack")}
          </button>
        </div>
      )}
    </li>
  );
}

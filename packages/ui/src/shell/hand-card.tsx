// SPDX-License-Identifier: Apache-2.0

import { setStepDone, type ItemState } from "@buckets/core";
import type { ReactElement } from "react";
import { useActions } from "../app-environment";
import { t } from "../i18n";

/** Props for {@link HandCard}. */
export interface HandCardProps {
  /** The bucket this item is in. */
  bucketId: string;
  /** The item and its state; its status is `"hand"`. */
  state: ItemState;
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
 * An item that has been drawn: its title, steps to tick off, and Done and Toss back.
 *
 * @param props - See {@link HandCardProps}.
 * @returns The card.
 */
export function HandCard({
  bucketId,
  state,
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
  return (
    <li
      ref={(element) => {
        registerCard?.(item.id, element);
      }}
      data-testid={`hand-${item.id}`}
      // While the slip is on its way, or the title is still hidden, the card can't be read,
      // reached or clicked; `inert` does all three.
      inert={pending || concealed}
      style={{
        opacity: pending ? 0 : undefined,
        background: "var(--paper)",
        color: "var(--paper-ink)",
        borderRadius: "var(--r-m)",
        padding: "var(--space-3)",
        boxShadow: "var(--shadow-card)",
        display: "grid",
        gap: "var(--space-2)",
      }}
    >
      <button
        type="button"
        onClick={onSelect}
        style={{
          all: "unset",
          cursor: "pointer",
          fontWeight: 600,
          fontSize: "1.15em",
          color: concealed ? "transparent" : undefined,
        }}
      >
        {item.title}
      </button>
      {!mine && (
        <span style={{ color: "var(--paper-ink-2)" }}>
          {t("hand.heldBy", { name: holderName })}
        </span>
      )}
      {item.steps.length > 0 && (
        <ul
          style={{
            listStyle: "none",
            margin: 0,
            padding: 0,
            display: "grid",
            gap: "var(--space-1)",
          }}
        >
          {item.steps.map((step) => (
            <li key={step.id}>
              <label style={{ display: "flex", gap: "var(--space-2)", alignItems: "center" }}>
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
      )}
      {canResolve && (
        <div style={{ display: "flex", gap: "var(--space-2)" }}>
          <button
            type="button"
            onClick={onDone}
            data-testid="done"
            style={{
              background: "var(--enamel)",
              color: "var(--on-enamel)",
              border: 0,
              borderRadius: "var(--r-s)",
              padding: "var(--space-1) var(--space-3)",
            }}
          >
            {t("hand.done")}
          </button>
          <button type="button" onClick={onTossBack} data-testid="toss-back">
            {t("hand.tossBack")}
          </button>
        </div>
      )}
    </li>
  );
}

// SPDX-License-Identifier: Apache-2.0

import { addItem, type Bucket, type ItemState } from "@buckets/core";
import { useState, type ReactElement, type RefObject } from "react";
import { useActions } from "../app-environment";
import { t, tp } from "../i18n";
import { titleHidden } from "./draw-messages";

/** Props for {@link ContentsList}. */
export interface ContentsListProps {
  /** The bucket. */
  bucket: Bucket;
  /** Every item's state, in any order. */
  states: readonly ItemState[];
  /** The item shown in the details pane. */
  selectedItemId: string | undefined;
  /** Called when the user picks an item. */
  onSelect: (itemId: string) => void;
  /** Whether the current member may add items. */
  canEdit: boolean;
  /** Lets the shell focus the "add an item" box (the New item shortcut). */
  addInputRef: RefObject<HTMLInputElement | null>;
}

/**
 * Everything in the bucket, with a box to add more. The richer editing list arrives with
 * the rest of M2; this is the plain version the draw loop needs.
 *
 * @param props - See {@link ContentsListProps}.
 * @returns The list.
 */
export function ContentsList({
  bucket,
  states,
  selectedItemId,
  onSelect,
  canEdit,
  addInputRef,
}: ContentsListProps): ReactElement {
  const actions = useActions();
  const [title, setTitle] = useState("");
  const byId = new Map(states.map((s) => [s.item.id, s]));
  const ordered = bucket.itemOrder.flatMap((id) => {
    const state = byId.get(id);
    return state ? [state] : [];
  });

  return (
    <section aria-label={t("contents.title")} style={{ display: "grid", gap: "var(--space-2)" }}>
      <h3 style={{ margin: 0, fontSize: "0.9em", color: "var(--text-2)" }}>
        {t("contents.title")}
      </h3>
      {ordered.length === 0 && <p style={{ color: "var(--text-2)" }}>{t("contents.empty")}</p>}
      <ul style={{ listStyle: "none", margin: 0, padding: 0 }}>
        {ordered.map((state) => {
          const hidden = titleHidden(bucket, state.status);
          const label = hidden ? t("contents.hidden") : state.item.title;
          return (
            <li key={state.item.id} style={{ borderBottom: "1px solid var(--sep)" }}>
              <button
                type="button"
                disabled={hidden}
                aria-label={hidden ? undefined : t("contents.select", { title: state.item.title })}
                aria-current={state.item.id === selectedItemId ? "true" : undefined}
                onClick={() => {
                  onSelect(state.item.id);
                }}
                data-testid={`item-${state.item.id}`}
                style={{
                  width: "100%",
                  display: "flex",
                  gap: "var(--space-2)",
                  textAlign: "left",
                  border: 0,
                  background: state.item.id === selectedItemId ? "var(--fill)" : "transparent",
                  padding: "var(--space-2)",
                  opacity: state.item.archived ? 0.55 : 1,
                }}
              >
                <span style={{ flex: 1 }}>{label}</span>
                {state.stepsProgress.total > 0 && (
                  <span style={{ color: "var(--text-2)" }}>
                    {t("steps.progress", state.stepsProgress)}
                  </span>
                )}
                <span style={{ color: "var(--text-2)" }}>
                  {state.item.archived
                    ? t("contents.archived")
                    : t(`contents.status.${state.status}`)}
                </span>
              </button>
            </li>
          );
        })}
      </ul>
      {canEdit && (
        <form
          onSubmit={(event) => {
            event.preventDefault();
            const result = actions.run(bucket.id, (b, ctx) => addItem(b, { title }, ctx));
            if (result.ok) setTitle("");
          }}
        >
          <input
            ref={addInputRef}
            value={title}
            onChange={(e) => {
              setTitle(e.target.value);
            }}
            placeholder={t("contents.addPlaceholder")}
            aria-label={t("contents.add")}
            style={{ width: "100%" }}
          />
        </form>
      )}
      <span className="sr-only">{tp("count.items", ordered.length)}</span>
    </section>
  );
}

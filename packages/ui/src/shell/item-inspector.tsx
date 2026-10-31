// SPDX-License-Identifier: Apache-2.0

import {
  addStep,
  removeItem,
  removeStep,
  setItemArchived,
  setItemNotes,
  setItemTitle,
  setItemWeight,
  setStepDone,
  setStepTitle,
  type Bucket,
} from "@buckets/core";
import { useState, type ReactElement } from "react";
import { useActions } from "../app-environment";
import { t } from "../i18n";
import { ConfirmDialog } from "./confirm-dialog";
import { TextField } from "./text-field";

/** Props for {@link ItemInspector}. */
export interface ItemInspectorProps {
  /** The bucket the item is in. */
  bucket: Bucket;
  /** The item to show. */
  itemId: string;
  /** Whether the current member may change it. */
  canEdit: boolean;
  /** Called after the item is deleted. */
  onDeleted: () => void;
}

/**
 * Details of one item: title, notes, steps, weight, archive and delete. Links and images
 * are added by the contents editor later in M2.
 *
 * @param props - See {@link ItemInspectorProps}.
 * @returns The details, or nothing when the item no longer exists.
 */
export function ItemInspector({
  bucket,
  itemId,
  canEdit,
  onDeleted,
}: ItemInspectorProps): ReactElement | null {
  const actions = useActions();
  const [stepTitle, setNewStepTitle] = useState("");
  const [confirming, setConfirming] = useState(false);
  const item = bucket.items[itemId];
  if (item === undefined) return null;
  const run = <T,>(command: Parameters<typeof actions.run<T>>[1]): void => {
    actions.run(bucket.id, command);
  };

  return (
    <div style={{ display: "grid", gap: "var(--space-3)" }} data-testid="item-inspector">
      <TextField
        key={`title-${item.title}`}
        label={t("inspector.itemTitle")}
        value={item.title}
        disabled={!canEdit}
        onCommit={(v) => {
          run((b, ctx) => setItemTitle(b, itemId, v, ctx));
        }}
      />
      <TextField
        key={`notes-${item.notes ?? ""}`}
        label={t("inspector.notes")}
        value={item.notes ?? ""}
        multiline
        disabled={!canEdit}
        onCommit={(v) => {
          run((b, ctx) => setItemNotes(b, itemId, v, ctx));
        }}
      />
      <fieldset
        style={{ border: 0, padding: 0, margin: 0, display: "grid", gap: "var(--space-1)" }}
      >
        <legend>{t("inspector.steps")}</legend>
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
            <li
              key={step.id}
              style={{ display: "flex", gap: "var(--space-1)", alignItems: "center" }}
            >
              <input
                type="checkbox"
                checked={step.done}
                aria-label={t("inspector.stepDone", { title: step.title })}
                onChange={(e) => {
                  run((b, ctx) => setStepDone(b, itemId, step.id, e.target.checked, ctx));
                }}
              />
              <input
                key={`step-${step.id}-${step.title}`}
                defaultValue={step.title}
                disabled={!canEdit}
                aria-label={step.title}
                style={{ flex: 1 }}
                onBlur={(e) => {
                  if (e.target.value !== step.title)
                    run((b, ctx) => setStepTitle(b, itemId, step.id, e.target.value, ctx));
                }}
              />
              {canEdit && (
                <button
                  type="button"
                  aria-label={t("inspector.removeStep", { title: step.title })}
                  onClick={() => {
                    run((b, ctx) => removeStep(b, itemId, step.id, ctx));
                  }}
                >
                  ×
                </button>
              )}
            </li>
          ))}
        </ul>
        {canEdit && (
          <form
            onSubmit={(event) => {
              event.preventDefault();
              const result = actions.run(bucket.id, (b, ctx) => addStep(b, itemId, stepTitle, ctx));
              if (result.ok) setNewStepTitle("");
            }}
          >
            <input
              value={stepTitle}
              onChange={(e) => {
                setNewStepTitle(e.target.value);
              }}
              placeholder={t("inspector.stepPlaceholder")}
              aria-label={t("inspector.addStep")}
              style={{ width: "100%" }}
            />
          </form>
        )}
      </fieldset>
      <label style={{ display: "grid", gap: "var(--space-1)" }}>
        {t("inspector.weight")}
        <input
          key={`weight-${String(item.weight)}`}
          type="number"
          min={0}
          step="any"
          defaultValue={item.weight}
          disabled={!canEdit}
          onBlur={(e) => {
            const weight = Number(e.target.value);
            if (weight !== item.weight) run((b, ctx) => setItemWeight(b, itemId, weight, ctx));
          }}
        />
        <small style={{ color: "var(--text-2)" }}>{t("inspector.weightHelp")}</small>
      </label>
      <label style={{ display: "flex", gap: "var(--space-2)" }}>
        <input
          type="checkbox"
          checked={item.archived}
          disabled={!canEdit}
          onChange={(e) => {
            run((b, ctx) => setItemArchived(b, itemId, e.target.checked, ctx));
          }}
        />
        {t("inspector.archive")}
      </label>
      {canEdit && (
        <button
          type="button"
          onClick={() => {
            setConfirming(true);
          }}
          style={{ color: "var(--danger)" }}
        >
          {t("inspector.deleteItem")}
        </button>
      )}
      <ConfirmDialog
        open={confirming}
        title={t("inspector.deleteItemTitle", { title: item.title })}
        confirmLabel={t("shell.delete")}
        danger
        onCancel={() => {
          setConfirming(false);
        }}
        onConfirm={() => {
          setConfirming(false);
          run((b, ctx) => removeItem(b, itemId, ctx));
          onDeleted();
        }}
      >
        <p>{t("inspector.deleteItemBody")}</p>
      </ConfirmDialog>
    </div>
  );
}

// SPDX-License-Identifier: Apache-2.0

import {
  convertStepToItem,
  removeStep,
  setStepDone,
  setStepTitle,
  type Item,
  type Step,
} from "@buckets/core";
import type { KeyboardEvent, ReactElement, RefObject } from "react";
import { useActions } from "../app-environment";
import { t } from "../i18n";
import { useAnnounce } from "../live-region";

/** Props for {@link StepRow}. */
export interface StepRowProps {
  /** The bucket the item is in. */
  bucketId: string;
  /** The item the step belongs to. */
  item: Item;
  /** The step. */
  step: Step;
  /** Whether the current member may edit steps (anyone who may draw can still tick them). */
  canEdit: boolean;
  /** Whether the current member may tick steps. */
  canTick: boolean;
  /** Where focus goes after Enter, so the user can keep typing. */
  addInputRef: RefObject<HTMLInputElement | null>;
}

/**
 * One step under an item. Click or press Space on the box to tick it; type in the title to
 * rename it; Shift-Tab turns it into an item of its own; Backspace in an empty title removes it.
 *
 * @param props - See {@link StepRowProps}.
 * @returns The row.
 */
export function StepRow({
  bucketId,
  item,
  step,
  canEdit,
  canTick,
  addInputRef,
}: StepRowProps): ReactElement {
  const actions = useActions();
  const announce = useAnnounce();

  const onKeyDown = (event: KeyboardEvent<HTMLInputElement>): void => {
    const input = event.currentTarget;
    if (event.key === "Enter") {
      input.blur();
      addInputRef.current?.focus();
    } else if (event.key === "Escape") {
      input.value = step.title;
      input.blur();
    } else if (event.key === "Tab" && event.shiftKey && canEdit) {
      event.preventDefault();
      const result = actions.run(bucketId, (b, ctx) => convertStepToItem(b, item.id, step.id, ctx));
      if (result.ok) announce(t("list.stepToItem", { title: step.title }));
    } else if (event.key === "Backspace" && input.value === "" && canEdit) {
      event.preventDefault();
      actions.run(bucketId, (b, ctx) => removeStep(b, item.id, step.id, ctx));
    }
  };

  return (
    <div
      role="row"
      data-testid={`step-${step.id}`}
      style={{
        display: "grid",
        gridTemplateColumns: "var(--columns)",
        alignItems: "center",
        paddingLeft: "var(--space-6)",
        color: "var(--text-2)",
      }}
    >
      <div
        role="cell"
        style={{
          display: "flex",
          gap: "var(--space-2)",
          alignItems: "center",
          padding: "var(--space-1) var(--space-2)",
        }}
      >
        <input
          type="checkbox"
          checked={step.done}
          disabled={!canTick}
          aria-label={t("inspector.stepDone", { title: step.title })}
          onChange={(e) => {
            actions.run(bucketId, (b, ctx) =>
              setStepDone(b, item.id, step.id, e.target.checked, ctx),
            );
          }}
        />
        <input
          key={`${step.id}-${step.title}`}
          defaultValue={step.title}
          disabled={!canEdit}
          aria-label={t("list.stepTitleOf", { title: step.title })}
          style={{
            flex: 1,
            border: 0,
            background: "transparent",
            textDecoration: step.done ? "line-through" : "none",
          }}
          onKeyDown={onKeyDown}
          onBlur={(e) => {
            if (e.target.value.trim() !== "" && e.target.value !== step.title)
              actions.run(bucketId, (b, ctx) =>
                setStepTitle(b, item.id, step.id, e.target.value, ctx),
              );
          }}
        />
      </div>
    </div>
  );
}

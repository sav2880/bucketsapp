// SPDX-License-Identifier: Apache-2.0

import { setItemTitle, type ItemState } from "@buckets/core";
import type { DragEvent, KeyboardEvent, MouseEvent, ReactElement, RefObject } from "react";
import { useActions } from "../app-environment";
import { t, tp } from "../i18n";
import { ProgressRing } from "./progress-ring";

/** Props for {@link ItemRow}. */
export interface ItemRowProps {
  /** The bucket. */
  bucketId: string;
  /** The item and its state. */
  state: ItemState;
  /** Whether the title is hidden (Mystery Bag). */
  hidden: boolean;
  /** Whether the row is part of the selection. */
  selected: boolean;
  /** Whether the row is the drop target of a drag, so a line shows above it. */
  dropTarget: boolean;
  /** Whether the current member may edit and drag items. */
  canEdit: boolean;
  /** Where focus goes after Enter. */
  addInputRef: RefObject<HTMLInputElement | null>;
  /** Called on a click anywhere in the row. */
  onClick: (event: MouseEvent<HTMLElement>) => void;
  /** Called for keys the list handles (arrows, Delete). */
  onKeyDown: (event: KeyboardEvent<HTMLElement>) => void;
  /** Called when a drag starts on this row. */
  onDragStart: (event: DragEvent<HTMLElement>) => void;
  /** Called while something is dragged over this row. */
  onDragOver: (event: DragEvent<HTMLElement>) => void;
  /** Called when something is dropped on this row. */
  onDrop: (event: DragEvent<HTMLElement>) => void;
  /** Called when a drag that started on this row ends, wherever it was dropped. */
  onDragEnd: (event: DragEvent<HTMLElement>) => void;
  /** The row's place in the table, counting the header as row 1 (screen readers announce it). */
  rowIndex: number;
}

const cell = { padding: "var(--space-2)", minWidth: 0 } as const;

/**
 * One item in the list: an editable title, a progress ring for its steps, its status, weight
 * and when it was added. Rows can be clicked to select, dragged to reorder or move, and moved
 * with ⌥↑ and ⌥↓.
 *
 * @param props - See {@link ItemRowProps}.
 * @returns The row.
 */
export function ItemRow({
  bucketId,
  state,
  hidden,
  selected,
  dropTarget,
  canEdit,
  addInputRef,
  onClick,
  onKeyDown,
  onDragStart,
  onDragOver,
  onDrop,
  onDragEnd,
  rowIndex,
}: ItemRowProps): ReactElement {
  const actions = useActions();
  const { item } = state;
  const images = item.attachments.length;

  return (
    <div
      role="row"
      aria-rowindex={rowIndex}
      tabIndex={0}
      aria-selected={selected}
      draggable={canEdit && !hidden}
      data-testid={`item-${item.id}`}
      onClick={onClick}
      onKeyDown={onKeyDown}
      onDragStart={onDragStart}
      onDragOver={onDragOver}
      onDrop={onDrop}
      onDragEnd={onDragEnd}
      style={{
        display: "grid",
        gridTemplateColumns: "var(--columns)",
        alignItems: "center",
        borderBottom: "1px solid var(--sep)",
        borderTop: dropTarget ? "2px solid var(--accent)" : "2px solid transparent",
        background: selected ? "var(--fill)" : "transparent",
        opacity: item.archived ? 0.55 : 1,
      }}
    >
      <div
        role="cell"
        style={{ ...cell, display: "flex", gap: "var(--space-2)", alignItems: "center" }}
      >
        {hidden ? (
          <span style={{ flex: 1, color: "var(--text-2)" }}>{t("contents.hidden")}</span>
        ) : (
          <input
            key={`${item.id}-${item.title}`}
            defaultValue={item.title}
            disabled={!canEdit}
            aria-label={t("list.titleOf", { title: item.title })}
            style={{ flex: 1, minWidth: 0, border: 0, background: "transparent" }}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.currentTarget.blur();
                addInputRef.current?.focus();
              } else if (e.key === "Escape") {
                e.currentTarget.value = item.title;
                e.currentTarget.blur();
              }
            }}
            onBlur={(e) => {
              if (e.target.value.trim() === "") e.target.value = item.title;
              else if (e.target.value !== item.title)
                actions.run(bucketId, (b, ctx) => setItemTitle(b, item.id, e.target.value, ctx));
            }}
          />
        )}
        {images > 0 && (
          <span
            role="img"
            aria-label={tp("list.imagesBadge", images)}
            title={tp("list.imagesBadge", images)}
          >
            🖼
          </span>
        )}
      </div>
      <div role="cell" style={cell}>
        <ProgressRing done={state.stepsProgress.done} total={state.stepsProgress.total} />
      </div>
      <div role="cell" style={{ ...cell, color: "var(--text-2)" }}>
        {item.archived ? t("contents.archived") : t(`contents.status.${state.status}`)}
      </div>
      <div role="cell" style={{ ...cell, color: "var(--text-2)" }}>
        {item.weight}
      </div>
      <div role="cell" style={{ ...cell, color: "var(--text-2)" }}>
        {new Date(item.createdAt).toLocaleDateString(undefined, { dateStyle: "medium" })}
      </div>
    </div>
  );
}

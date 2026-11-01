// SPDX-License-Identifier: Apache-2.0

import {
  addItem,
  addStep,
  removeItem,
  reorderItems,
  type Bucket,
  type ItemState,
} from "@buckets/core";
import {
  useEffect,
  useRef,
  useState,
  type ClipboardEvent,
  type DragEvent,
  type KeyboardEvent,
  type MouseEvent,
  type ReactElement,
  type RefObject,
} from "react";
import { useActions } from "../app-environment";
import { useSetting } from "../hooks/use-setting";
import { t, tp } from "../i18n";
import type { ColumnSpec } from "../layout/columns";
import { ResizableColumns } from "../layout/resizable-columns";
import { useAnnounce } from "../live-region";
import { useLibrary } from "../library/library-provider";
import { ConfirmDialog } from "./confirm-dialog";
import { titleHidden } from "./draw-messages";
import { ItemRow } from "./item-row";
import { moveBefore, moveBy, nextSelection, titlesFromPaste } from "./list-ordering";
import { StepRow } from "./step-row";
import { sizes } from "../tokens/index";
import { usePlatform } from "../hooks/use-platform";
import { useWindowedRows } from "./use-windowed-rows";

/** The data type that marks a drag of items from this list. */
export const ITEMS_DRAG_TYPE = "application/x-buckets-items";

/** What is carried by a drag of items. */
export interface ItemsDragPayload {
  /** The bucket the items are dragged from. */
  bucketId: string;
  /** The items. */
  ids: string[];
}

/** Props for {@link ItemList}. */
export interface ItemListProps {
  /** The bucket. */
  bucket: Bucket;
  /** Every item's state, in any order. */
  states: readonly ItemState[];
  /** Ids of the selected items. */
  selectedIds: readonly string[];
  /** Called when the selection changes. */
  onSelectedIdsChange: (ids: string[]) => void;
  /** Whether the current member may add and change items. */
  canEdit: boolean;
  /** Whether the current member may tick steps. */
  canTick: boolean;
  /** Lets the shell focus the "add an item" box. */
  addInputRef: RefObject<HTMLInputElement | null>;
  /**
   * The element that scrolls the list (the bucket pane). A long list draws only the rows that
   * are on screen; without it, or where nothing can be measured, every row is drawn.
   */
  scrollRef: RefObject<HTMLElement | null>;
}

const COLUMNS: ColumnSpec[] = [
  { id: "name", label: "list.name", defaultWidth: 240, minWidth: 160, flexible: true },
  { id: "steps", label: "list.steps", defaultWidth: 90, minWidth: 60, maxWidth: 200 },
  { id: "status", label: "list.status", defaultWidth: 110, minWidth: 70, maxWidth: 320 },
  { id: "weight", label: "list.weight", defaultWidth: 70, minWidth: 50, maxWidth: 160 },
  { id: "added", label: "list.added", defaultWidth: 110, minWidth: 80, maxWidth: 240 },
];

function isWidths(value: unknown): value is Record<string, number> {
  return (
    typeof value === "object" &&
    value !== null &&
    Object.values(value).every((n) => typeof n === "number" && Number.isFinite(n))
  );
}

/**
 * The items of a bucket, Reminders-style: type on the last row and press Return to add the
 * next; Tab makes a new row a step of the item above and Shift-Tab brings a step back out;
 * click to select (⌘ or Ctrl-click and Shift-click for several); drag rows to reorder them or
 * onto a bucket in the sidebar to move them; ⌥↑ and ⌥↓ do the same from the keyboard; Delete
 * removes the selection after asking.
 *
 * @param props - See {@link ItemListProps}.
 * @returns The list.
 */
export function ItemList({
  bucket,
  states,
  selectedIds,
  onSelectedIdsChange,
  canEdit,
  canTick,
  addInputRef,
  scrollRef,
}: ItemListProps): ReactElement {
  const actions = useActions();
  const announce = useAnnounce();
  const platform = usePlatform();
  const { library, buckets } = useLibrary();
  const [widths, setWidths] = useSetting("columns-items", isWidths);
  const [title, setTitle] = useState("");
  const [dropBefore, setDropBefore] = useState<string | null | undefined>(undefined);
  const [deleting, setDeleting] = useState(false);
  const anchor = useRef<string | undefined>(undefined);
  const rowsRef = useRef<HTMLDivElement>(null);
  // Rows that must stay drawn even when scrolled out of view: the one being edited, the one
  // being dragged (a dragged row that disappears cancels the drag), and one about to get focus.
  const [focusedId, setFocusedId] = useState<string | undefined>(undefined);
  const [draggingId, setDraggingId] = useState<string | undefined>(undefined);
  const pendingFocus = useRef<string | undefined>(undefined);

  const byId = new Map(states.map((s) => [s.item.id, s]));
  const ordered = bucket.itemOrder.flatMap((id) => {
    const state = byId.get(id);
    return state ? [state] : [];
  });
  const order = ordered.map((s) => s.item.id);
  const selected = new Set(selectedIds);
  // Where each item's row sits in the table (the header is row 1), for screen readers.
  const rowStart: number[] = [];
  let totalRows = 1;
  for (const state of ordered) {
    rowStart.push(totalRows + 1);
    totalRows += 1 + (titleHidden(bucket, state.status) ? 0 : state.item.steps.length);
  }
  const windowing = useWindowedRows({
    count: ordered.length,
    scrollRef,
    listRef: rowsRef,
    estimate: (index) => {
      const state = ordered[index];
      const rows =
        1 +
        (state === undefined || titleHidden(bucket, state.status) ? 0 : state.item.steps.length);
      return rows * sizes.listRowEstimate;
    },
    keep: [focusedId, draggingId]
      .filter((id): id is string => id !== undefined)
      .map((id) => order.indexOf(id)),
  });

  /** Moves focus to an item's row, scrolling to it first when it isn't drawn. */
  const focusItem = (id: string): void => {
    const row = document.querySelector<HTMLElement>(`[data-testid="item-${id}"]`);
    if (row) {
      row.focus();
      return;
    }
    const index = order.indexOf(id);
    if (index < 0) return;
    // Keeping it drawn is what lets it be found once the scroll has brought it into range.
    pendingFocus.current = id;
    setFocusedId(id);
    windowing.scrollToIndex(index);
  };
  // Once the row has been drawn, give it the focus that was asked for.
  useEffect(() => {
    const id = pendingFocus.current;
    if (id === undefined) return;
    const row = document.querySelector<HTMLElement>(`[data-testid="item-${id}"]`);
    if (row === null) return;
    pendingFocus.current = undefined;
    row.focus();
  });
  const columns = COLUMNS.map((c) => ({ ...c, label: t(c.label as "list.name") }));
  const others = library.bucketOrder.filter((id) => id !== bucket.id && buckets[id] !== undefined);

  const titleOf = (id: string): string => bucket.items[id]?.title ?? "";

  const select = (event: MouseEvent<HTMLElement>, id: string): void => {
    const result = nextSelection(order, selectedIds, anchor.current, id, {
      toggle: platform.os === "mac" ? event.metaKey : event.ctrlKey,
      range: event.shiftKey,
    });
    anchor.current = result.anchor;
    onSelectedIdsChange(result.selected);
  };

  const reorder = (next: string[], message: string): void => {
    const result = actions.run(bucket.id, (b, ctx) => reorderItems(b, next, ctx));
    if (result.ok) announce(message);
  };

  const move = (ids: readonly string[], destinationId: string): void => {
    const destination = buckets[destinationId];
    if (destination === undefined) return;
    let moved = 0;
    for (const id of ids) {
      const name = titleOf(id);
      const result = actions.moveItem(bucket.id, id, destinationId);
      if (result.ok) moved += 1;
      else if (result.reason === "item-in-hand" || result.reason === "item-has-child-bucket")
        announce(t(`list.moveRefused.${result.reason}`, { title: name }));
      else announce(t("list.moveRefused.other", { title: name }));
    }
    if (moved > 0) {
      onSelectedIdsChange(
        selectedIds.filter((id) => bucket.items[id] !== undefined && !ids.includes(id)),
      );
      announce(tp("list.moved", moved, { title: titleOf(ids[0] ?? ""), bucket: destination.name }));
    }
  };

  const onRowKeyDown = (event: KeyboardEvent<HTMLElement>, id: string): void => {
    // Keys typed in a title belong to the title.
    if (event.target !== event.currentTarget) return;
    const index = order.indexOf(id);
    if (event.altKey && (event.key === "ArrowUp" || event.key === "ArrowDown") && canEdit) {
      event.preventDefault();
      const ids = selectedIds.includes(id) ? selectedIds : [id];
      const up = event.key === "ArrowUp";
      reorder(
        moveBy(order, ids, up ? -1 : 1),
        t(up ? "list.movedUp" : "list.movedDown", { title: titleOf(id) }),
      );
    } else if (event.key === "ArrowUp" || event.key === "ArrowDown") {
      event.preventDefault();
      const next = order[index + (event.key === "ArrowUp" ? -1 : 1)];
      if (next !== undefined) focusItem(next);
    } else if (
      (event.key === "Delete" || event.key === "Backspace") &&
      canEdit &&
      !event.metaKey &&
      !event.ctrlKey
    ) {
      event.preventDefault();
      if (!selectedIds.includes(id)) onSelectedIdsChange([id]);
      setDeleting(true);
    } else if (event.key === " ") {
      event.preventDefault();
      onSelectedIdsChange(
        nextSelection(order, selectedIds, anchor.current, id, { toggle: true, range: false })
          .selected,
      );
    }
  };

  const dragIds = (id: string): string[] => (selectedIds.includes(id) ? [...selectedIds] : [id]);
  const carriesItems = (event: DragEvent<HTMLElement>): boolean =>
    event.dataTransfer.types.includes(ITEMS_DRAG_TYPE);

  const addTyped = (): void => {
    const result = actions.run(bucket.id, (b, ctx) => addItem(b, { title }, ctx));
    if (result.ok) setTitle("");
  };

  const addAsStep = (): void => {
    const parent = order[order.length - 1];
    if (parent === undefined || title.trim() === "") return;
    const result = actions.run(bucket.id, (b, ctx) => addStep(b, parent, title, ctx));
    if (result.ok) {
      setTitle("");
      announce(t("list.stepAdded", { title: titleOf(parent) }));
    }
  };

  const onPaste = (event: ClipboardEvent<HTMLInputElement>): void => {
    const lines = titlesFromPaste(event.clipboardData.getData("text"));
    if (lines.length < 2) return;
    event.preventDefault();
    let added = 0;
    for (const line of lines)
      if (actions.run(bucket.id, (b, ctx) => addItem(b, { title: line }, ctx)).ok) added += 1;
    announce(tp("list.added", added));
  };

  const confirmDelete = (): void => {
    for (const id of selectedIds) actions.run(bucket.id, (b, ctx) => removeItem(b, id, ctx));
    onSelectedIdsChange([]);
    setDeleting(false);
  };

  // The column that auto-fit measures against: the longest title on screen.
  const measure = (columnId: string): number =>
    columnId === "steps" ? 100 : columnId === "weight" ? 80 : columnId === "status" ? 130 : 120;

  return (
    <section aria-label={t("contents.title")} style={{ display: "grid", gap: "var(--space-2)" }}>
      <h3 style={{ margin: 0, fontSize: "0.9em", color: "var(--text-2)" }}>
        {t("contents.title")}
      </h3>
      {selectedIds.length > 1 || (selectedIds.length === 1 && canEdit) ? (
        <div
          role="toolbar"
          aria-label={tp("list.selected", selectedIds.length)}
          style={{ display: "flex", gap: "var(--space-2)", alignItems: "center" }}
        >
          <span>{tp("list.selected", selectedIds.length)}</span>
          {others.length > 0 && canEdit && (
            <select
              aria-label={t("list.moveTo")}
              value=""
              onChange={(e) => {
                if (e.target.value !== "") move(selectedIds, e.target.value);
              }}
            >
              <option value="">{t("list.moveChoose")}</option>
              {others.map((id) => (
                <option key={id} value={id}>
                  {buckets[id]?.name}
                </option>
              ))}
            </select>
          )}
          {canEdit && (
            <button
              type="button"
              onClick={() => {
                setDeleting(true);
              }}
              style={{ color: "var(--danger)" }}
            >
              {t("list.delete")}
            </button>
          )}
        </div>
      ) : null}
      {ordered.length === 0 && <p style={{ color: "var(--text-2)" }}>{t("contents.empty")}</p>}
      <ResizableColumns
        columns={columns}
        widths={widths}
        onWidthsChange={setWidths}
        measure={measure}
        rowCount={windowing.windowed ? totalRows : undefined}
      >
        <div
          ref={rowsRef}
          role="rowgroup"
          style={windowing.containerStyle}
          // Bubbling handlers, not capturing ones: React draws the result of a capturing
          // handler before the row's own blur handler runs, which would remove the row (and
          // lose a half-typed title) before it could save.
          onFocus={(event) => {
            const id = (event.target as Element)
              .closest("[data-item-id]")
              ?.getAttribute("data-item-id");
            setFocusedId(id ?? undefined);
          }}
          onBlur={(event) => {
            if (!event.currentTarget.contains(event.relatedTarget)) setFocusedId(undefined);
          }}
        >
          {windowing.rows.map(({ index, style }) => {
            const state = ordered[index];
            if (state === undefined) return null;
            const { item } = state;
            const hidden = titleHidden(bucket, state.status);
            return (
              <div
                key={item.id}
                ref={windowing.measureRef}
                data-index={index}
                data-item-id={item.id}
                style={style}
              >
                <ItemRow
                  bucketId={bucket.id}
                  state={state}
                  hidden={hidden}
                  rowIndex={rowStart[index] ?? index + 2}
                  selected={selected.has(item.id)}
                  dropTarget={dropBefore === item.id}
                  canEdit={canEdit}
                  addInputRef={addInputRef}
                  onClick={(e) => {
                    if (!hidden) select(e, item.id);
                  }}
                  onKeyDown={(e) => {
                    onRowKeyDown(e, item.id);
                  }}
                  onDragStart={(e) => {
                    const payload: ItemsDragPayload = {
                      bucketId: bucket.id,
                      ids: dragIds(item.id),
                    };
                    e.dataTransfer.setData(ITEMS_DRAG_TYPE, JSON.stringify(payload));
                    e.dataTransfer.effectAllowed = "move";
                    setDraggingId(item.id);
                  }}
                  onDragEnd={() => {
                    setDraggingId(undefined);
                    setDropBefore(undefined);
                  }}
                  onDragOver={(e) => {
                    if (!canEdit || !carriesItems(e)) return;
                    e.preventDefault();
                    setDropBefore(item.id);
                  }}
                  onDrop={(e) => {
                    setDropBefore(undefined);
                    if (!canEdit || !carriesItems(e)) return;
                    e.preventDefault();
                    const payload = JSON.parse(
                      e.dataTransfer.getData(ITEMS_DRAG_TYPE),
                    ) as ItemsDragPayload;
                    if (payload.bucketId !== bucket.id) return;
                    reorder(
                      moveBefore(order, payload.ids, item.id),
                      t("list.reordered", { title: titleOf(payload.ids[0] ?? "") }),
                    );
                  }}
                />
                {!hidden &&
                  item.steps.map((step, stepIndex) => (
                    <StepRow
                      key={step.id}
                      rowIndex={(rowStart[index] ?? index + 2) + 1 + stepIndex}
                      bucketId={bucket.id}
                      item={item}
                      step={step}
                      canEdit={canEdit}
                      canTick={canTick}
                      addInputRef={addInputRef}
                    />
                  ))}
              </div>
            );
          })}
        </div>
      </ResizableColumns>
      {canEdit && (
        <form
          onSubmit={(event) => {
            event.preventDefault();
            addTyped();
          }}
        >
          <input
            ref={addInputRef}
            value={title}
            onChange={(e) => {
              setTitle(e.target.value);
            }}
            onPaste={onPaste}
            onKeyDown={(e) => {
              // Tab turns what is typed into a step of the item above; with nothing typed it moves on as usual.
              if (e.key === "Tab" && !e.shiftKey && title.trim() !== "" && order.length > 0) {
                e.preventDefault();
                addAsStep();
              }
            }}
            placeholder={t("contents.addPlaceholder")}
            aria-label={t("contents.add")}
            style={{ width: "100%" }}
            onDragOver={(e) => {
              if (carriesItems(e)) {
                e.preventDefault();
                setDropBefore(null);
              }
            }}
            onDragLeave={() => {
              setDropBefore(undefined);
            }}
            onDrop={(e) => {
              setDropBefore(undefined);
              if (!carriesItems(e)) return;
              e.preventDefault();
              const payload = JSON.parse(
                e.dataTransfer.getData(ITEMS_DRAG_TYPE),
              ) as ItemsDragPayload;
              if (payload.bucketId === bucket.id)
                reorder(
                  moveBefore(order, payload.ids, undefined),
                  t("list.reordered", { title: titleOf(payload.ids[0] ?? "") }),
                );
            }}
          />
        </form>
      )}
      <ConfirmDialog
        open={deleting}
        title={
          selectedIds.length === 1
            ? t("list.deleteTitle.one", { title: titleOf(selectedIds[0] ?? "") })
            : tp("list.deleteTitle", selectedIds.length)
        }
        confirmLabel={t("shell.delete")}
        danger
        onCancel={() => {
          setDeleting(false);
        }}
        onConfirm={confirmDelete}
      >
        <p>{t("list.deleteBody")}</p>
      </ConfirmDialog>
    </section>
  );
}

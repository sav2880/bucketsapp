// SPDX-License-Identifier: Apache-2.0

import { deriveItems } from "@buckets/core";
import type { ReactElement } from "react";
import { useLibrary } from "../library/library-provider";
import { useActions, useNow } from "../app-environment";
import { useAnnounce } from "../live-region";
import { ITEMS_DRAG_TYPE, type ItemsDragPayload } from "./item-list";
import { t, tp } from "../i18n";
import { iconGlyph } from "./icons";

/** Props for {@link Sidebar}. */
export interface SidebarProps {
  /** The selected bucket. */
  selectedId: string | undefined;
  /** Called when the user picks a bucket. */
  onSelect: (bucketId: string) => void;
  /** Called when the user asks for a new bucket. */
  onNewBucket: () => void;
}

/**
 * The list of buckets with a count of what is still in each.
 *
 * @param props - See {@link SidebarProps}.
 * @returns The sidebar contents.
 */
export function Sidebar({ selectedId, onSelect, onNewBucket }: SidebarProps): ReactElement {
  const { library, buckets, problems } = useLibrary();
  const now = useNow();
  const actions = useActions();
  const announce = useAnnounce();

  const dropOn = (destinationId: string, raw: string): void => {
    const payload = JSON.parse(raw) as ItemsDragPayload;
    if (payload.bucketId === destinationId) return;
    const name = buckets[destinationId]?.name ?? "";
    let moved = 0;
    for (const id of payload.ids) {
      const title = buckets[payload.bucketId]?.items[id]?.title ?? "";
      const result = actions.moveItem(payload.bucketId, id, destinationId);
      if (result.ok) moved += 1;
      else if (result.reason === "item-in-hand" || result.reason === "item-has-child-bucket")
        announce(t(`list.moveRefused.${result.reason}`, { title }));
      else announce(t("list.moveRefused.other", { title }));
    }
    if (moved > 0) {
      const first = buckets[payload.bucketId]?.items[payload.ids[0] ?? ""]?.title ?? "";
      announce(tp("list.moved", moved, { title: first, bucket: name }));
    }
  };
  return (
    <nav
      aria-label={t("shell.buckets")}
      style={{
        display: "flex",
        flexDirection: "column",
        height: "100%",
        background: "var(--sidebar-bg)",
        padding: "var(--space-3)",
        gap: "var(--space-2)",
        overflowY: "auto",
      }}
    >
      <h2 style={{ fontSize: "0.85em", color: "var(--text-2)", margin: 0 }}>
        {t("shell.buckets")}
      </h2>
      {library.bucketOrder.length === 0 && problems.length === 0 && (
        <p style={{ color: "var(--text-2)" }}>{t("shell.noBuckets")}</p>
      )}
      <ul
        style={{ listStyle: "none", margin: 0, padding: 0, display: "grid", gap: "var(--space-1)" }}
      >
        {library.bucketOrder.map((id) => {
          const bucket = buckets[id];
          if (bucket === undefined) return null;
          const inside = deriveItems(bucket, now).filter(
            (s) => !s.item.archived && (s.status === "in" || s.status === "cooling"),
          ).length;
          const selected = id === selectedId;
          return (
            <li key={id}>
              <button
                type="button"
                aria-current={selected ? "true" : undefined}
                onClick={() => {
                  onSelect(id);
                }}
                data-testid={`bucket-${id}`}
                onDragOver={(e) => {
                  if (e.dataTransfer.types.includes(ITEMS_DRAG_TYPE)) e.preventDefault();
                }}
                onDrop={(e) => {
                  if (!e.dataTransfer.types.includes(ITEMS_DRAG_TYPE)) return;
                  e.preventDefault();
                  dropOn(id, e.dataTransfer.getData(ITEMS_DRAG_TYPE));
                }}
                style={{
                  width: "100%",
                  display: "flex",
                  alignItems: "center",
                  gap: "var(--space-2)",
                  textAlign: "left",
                  padding: "var(--space-1) var(--space-2)",
                  border: 0,
                  borderRadius: "var(--r-s)",
                  background: selected ? "var(--fill-strong)" : "transparent",
                }}
              >
                <span aria-hidden="true">{iconGlyph(bucket.icon)}</span>
                <span
                  style={{
                    flex: 1,
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                    whiteSpace: "nowrap",
                  }}
                >
                  {bucket.name}
                </span>
                <span style={{ color: "var(--text-2)" }} aria-label={tp("count.items", inside)}>
                  {inside}
                </span>
              </button>
            </li>
          );
        })}
      </ul>
      {problems.map((problem) => (
        <p key={problem.key} role="alert" style={{ color: "var(--danger)" }}>
          {t(
            problem.kind === "newer-version"
              ? "library.newerVersion"
              : problem.kind === "missing"
                ? "library.missing"
                : "library.unreadable",
          )}
        </p>
      ))}
      <button
        type="button"
        onClick={onNewBucket}
        data-testid="new-bucket"
        style={{ marginTop: "auto" }}
      >
        {t("shell.newBucket")}
      </button>
    </nav>
  );
}

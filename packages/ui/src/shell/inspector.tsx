// SPDX-License-Identifier: Apache-2.0

import type { ReactElement } from "react";
import { useEnvironment } from "../app-environment";
import { t } from "../i18n";
import { useBucket } from "../library/library-provider";
import { BucketInspector } from "./bucket-inspector";
import { ItemInspector } from "./item-inspector";

/** What the details pane is showing. */
export type InspectorMode = "item" | "bucket";

/** Props for {@link Inspector}. */
export interface InspectorProps {
  /** The bucket. */
  bucketId: string;
  /** The selected item, if any. */
  itemId: string | undefined;
  /** Which kind of details to show. Items fall back to the bucket when none is selected. */
  mode: InspectorMode;
  /** Called when the user switches between item and bucket details. */
  onModeChange: (mode: InspectorMode) => void;
  /** Called after the selected item is deleted. */
  onItemDeleted: () => void;
  /** Called after the bucket is deleted. */
  onBucketDeleted: () => void;
}

/**
 * The details pane: the selected item, or the bucket's settings.
 *
 * @param props - See {@link InspectorProps}.
 * @returns The pane contents.
 */
export function Inspector({
  bucketId,
  itemId,
  mode,
  onModeChange,
  onItemDeleted,
  onBucketDeleted,
}: InspectorProps): ReactElement | null {
  const bucket = useBucket(bucketId);
  const { memberId } = useEnvironment();
  if (bucket === undefined) return null;
  const role = bucket.members[memberId]?.role;
  const canEdit = role === "owner" || role === "editor";
  const item = itemId === undefined ? undefined : bucket.items[itemId];
  const showItem = mode === "item" && item !== undefined;

  return (
    <aside
      aria-label={t("inspector.title")}
      style={{
        height: "100%",
        overflowY: "auto",
        background: "var(--pane-bg)",
        padding: "var(--space-3)",
      }}
    >
      <div
        role="group"
        aria-label={t("inspector.title")}
        style={{ display: "flex", gap: "var(--space-1)", marginBottom: "var(--space-3)" }}
      >
        <button
          type="button"
          aria-pressed={showItem}
          disabled={item === undefined}
          onClick={() => {
            onModeChange("item");
          }}
        >
          {t("inspector.item")}
        </button>
        <button
          type="button"
          aria-pressed={!showItem}
          onClick={() => {
            onModeChange("bucket");
          }}
        >
          {t("inspector.bucket")}
        </button>
      </div>
      {showItem && itemId !== undefined ? (
        <ItemInspector
          bucket={bucket}
          itemId={itemId}
          canEdit={canEdit}
          onDeleted={onItemDeleted}
        />
      ) : (
        <BucketInspector bucket={bucket} canEdit={canEdit} onDeleted={onBucketDeleted} />
      )}
    </aside>
  );
}

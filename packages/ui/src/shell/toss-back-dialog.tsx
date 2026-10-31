// SPDX-License-Identifier: Apache-2.0

import type { TossBackConfirm } from "@buckets/core";
import { useState, type ReactElement } from "react";
import { t } from "../i18n";
import { ConfirmDialog } from "./confirm-dialog";

/** Props for {@link TossBackDialog}. */
export interface TossBackDialogProps {
  /** Title of the item being tossed back; `undefined` while closed. */
  title: string | undefined;
  /** How hard the bucket makes it: `"simple"` just asks, `"deliberate"` also asks why. */
  mode: Exclude<TossBackConfirm, "none">;
  /** Called with the reason (possibly empty) when the user confirms. */
  onConfirm: (reason: string) => void;
  /** Called when the user backs out. */
  onCancel: () => void;
}

/**
 * Asks before tossing an item back, as the bucket's rules require.
 *
 * @param props - See {@link TossBackDialogProps}.
 * @returns The dialog.
 */
export function TossBackDialog({
  title,
  mode,
  onConfirm,
  onCancel,
}: TossBackDialogProps): ReactElement {
  const [reason, setReason] = useState("");
  return (
    <ConfirmDialog
      open={title !== undefined}
      title={t("toss.title", { title: title ?? "" })}
      confirmLabel={t("toss.confirm")}
      onConfirm={() => {
        onConfirm(reason);
        setReason("");
      }}
      onCancel={() => {
        setReason("");
        onCancel();
      }}
    >
      <p>{t("toss.body")}</p>
      {mode === "deliberate" && (
        <label style={{ display: "grid", gap: "var(--space-1)" }}>
          {t("toss.reasonLabel")}
          <textarea
            value={reason}
            onChange={(e) => {
              setReason(e.target.value);
            }}
            rows={3}
          />
        </label>
      )}
    </ConfirmDialog>
  );
}

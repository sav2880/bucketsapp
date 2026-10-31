// SPDX-License-Identifier: Apache-2.0

import type { ReactElement, ReactNode } from "react";
import { t } from "../i18n";
import { Dialog } from "./dialog";

/** Props for {@link ConfirmDialog}. */
export interface ConfirmDialogProps {
  /** Whether it is showing. */
  open: boolean;
  /** Heading, usually a question. */
  title: string;
  /** Text under the heading, or extra fields. */
  children?: ReactNode;
  /** Label of the confirm button. */
  confirmLabel: string;
  /** Style the confirm button as destructive. */
  danger?: boolean;
  /** Called when the user confirms. */
  onConfirm: () => void;
  /** Called when the user backs out. */
  onCancel: () => void;
}

/**
 * Asks the user to confirm before something that can't be undone.
 *
 * @param props - See {@link ConfirmDialogProps}.
 * @returns The dialog.
 */
export function ConfirmDialog({
  open,
  title,
  children,
  confirmLabel,
  danger = false,
  onConfirm,
  onCancel,
}: ConfirmDialogProps): ReactElement {
  return (
    <Dialog open={open} onClose={onCancel} title={title}>
      {children}
      <div
        style={{
          display: "flex",
          justifyContent: "flex-end",
          gap: "var(--space-2)",
          marginTop: "var(--space-4)",
        }}
      >
        <button type="button" onClick={onCancel}>
          {t("shell.cancel")}
        </button>
        <button
          type="button"
          onClick={onConfirm}
          style={danger ? { color: "var(--danger)" } : undefined}
          data-testid="confirm"
        >
          {confirmLabel}
        </button>
      </div>
    </Dialog>
  );
}

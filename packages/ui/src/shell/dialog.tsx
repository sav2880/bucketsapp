// SPDX-License-Identifier: Apache-2.0

import {
  useEffect,
  useId,
  useRef,
  type CSSProperties,
  type ReactElement,
  type ReactNode,
} from "react";
import { t } from "../i18n";

/** Where a dialog appears. */
export type DialogPlacement = "center" | "right" | "left";

/** Props for {@link Dialog}. */
export interface DialogProps {
  /** Whether it is showing. Its contents are only built while open. */
  open: boolean;
  /** Called when the user closes it (Escape or the close button). */
  onClose: () => void;
  /** Heading; also the dialog's accessible name. */
  title: string;
  /** Centered box, or a sheet sliding in from the right or left edge. */
  placement?: DialogPlacement;
  /** Test id for the dialog element. */
  testId?: string;
  /** Contents. */
  children: ReactNode;
}

const placements: Record<DialogPlacement, CSSProperties> = {
  center: { margin: "auto", width: "min(440px, calc(100vw - 32px))" },
  right: { margin: "0 0 0 auto", height: "100%", maxHeight: "100%", width: "min(340px, 100vw)" },
  left: { margin: "0 auto 0 0", height: "100%", maxHeight: "100%", width: "min(300px, 100vw)" },
};

/**
 * A modal box built on the browser's own `<dialog>`, which traps focus, closes on Escape and
 * puts focus back where it was.
 *
 * @param props - See {@link DialogProps}.
 * @returns The dialog.
 */
export function Dialog({
  open,
  onClose,
  title,
  placement = "center",
  testId,
  children,
}: DialogProps): ReactElement {
  const ref = useRef<HTMLDialogElement>(null);
  const headingId = useId();

  useEffect(() => {
    const dialog = ref.current;
    if (dialog === null) return;
    if (open && !dialog.open) dialog.showModal();
    if (!open && dialog.open) dialog.close();
  }, [open]);

  const style: CSSProperties = {
    ...placements[placement],
    background: "var(--bg)",
    color: "var(--text)",
    border: "1px solid var(--sep)",
    borderRadius: placement === "center" ? "var(--r-l)" : 0,
    boxShadow: "var(--shadow-card)",
    padding: "var(--space-4)",
  };

  return (
    <dialog
      ref={ref}
      aria-labelledby={headingId}
      onClose={onClose}
      style={style}
      data-testid={testId}
    >
      {open && (
        <>
          <header
            style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              gap: "var(--space-2)",
            }}
          >
            <h2 id={headingId} style={{ fontSize: "1.15em", margin: 0 }}>
              {title}
            </h2>
            <button type="button" onClick={onClose}>
              {t("shell.close")}
            </button>
          </header>
          <div style={{ marginTop: "var(--space-3)" }}>{children}</div>
        </>
      )}
    </dialog>
  );
}

// SPDX-License-Identifier: Apache-2.0

import { useState, type ReactElement } from "react";

/** Props for {@link RuleNumberField}. */
export interface RuleNumberFieldProps {
  /** Visible label and accessible name. */
  label: string;
  /** The saved value, or `undefined` when the rule is not set. */
  value: number | undefined;
  /** Smallest whole number allowed. */
  min: number;
  /** Whether an empty box means "not set" (otherwise the last good number comes back). */
  allowEmpty?: boolean;
  /** Whether it can be changed. */
  disabled?: boolean;
  /**
   * Called with each new valid number as it is typed, or with `undefined` when emptied
   * (only if `allowEmpty`).
   */
  onCommit: (value: number | undefined) => void;
}

/**
 * A whole-number box for a bucket rule that saves as you type. A rule has to be in force the
 * moment it looks changed: saving only when the box loses focus meant a draw made with the
 * keyboard right after typing still used the old rule. While the text isn't a valid whole
 * number nothing is saved, and leaving the box puts the last good value back.
 *
 * @param props - See {@link RuleNumberFieldProps}.
 * @returns The labelled box.
 */
export function RuleNumberField({
  label,
  value,
  min,
  allowEmpty = false,
  disabled = false,
  onCommit,
}: RuleNumberFieldProps): ReactElement {
  // What is being typed. `undefined` means "show the saved value".
  const [draft, setDraft] = useState<string | undefined>(undefined);
  const shown = draft ?? (value === undefined ? "" : String(value));

  return (
    <label style={{ display: "grid", gap: "var(--space-1)" }}>
      {label}
      <input
        type="number"
        min={min}
        step={1}
        value={shown}
        disabled={disabled}
        onChange={(event) => {
          const text = event.target.value;
          setDraft(text);
          if (text === "") {
            if (allowEmpty && value !== undefined) onCommit(undefined);
            return;
          }
          const n = Number(text);
          if (Number.isInteger(n) && n >= min && n !== value) onCommit(n);
        }}
        onBlur={() => {
          setDraft(undefined);
        }}
      />
    </label>
  );
}

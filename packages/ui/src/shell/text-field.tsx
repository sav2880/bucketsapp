// SPDX-License-Identifier: Apache-2.0

import { useState, type ReactElement } from "react";

/** Props for {@link TextField}. */
export interface TextFieldProps {
  /** Visible label and accessible name. */
  label: string;
  /** The saved value. */
  value: string;
  /** Called with the new text when the user finishes (leaves the field, or presses Enter in a one-line field). */
  onCommit: (value: string) => void;
  /** Several lines. */
  multiline?: boolean;
  /** Greys it out. */
  disabled?: boolean;
  /** Hint shown while empty. */
  placeholder?: string;
}

/**
 * A text box that keeps what the user types to itself until they finish, so a half-typed name
 * is never saved. Give it a `key` that changes with the saved value to reset the draft.
 *
 * @param props - See {@link TextFieldProps}.
 * @returns A labelled input or textarea.
 */
export function TextField({
  label,
  value,
  onCommit,
  multiline = false,
  disabled = false,
  placeholder,
}: TextFieldProps): ReactElement {
  const [draft, setDraft] = useState(value);
  const commit = (): void => {
    if (draft !== value) onCommit(draft);
  };
  return (
    <label style={{ display: "grid", gap: "var(--space-1)" }}>
      {label}
      {multiline ? (
        <textarea
          value={draft}
          disabled={disabled}
          rows={4}
          placeholder={placeholder}
          onChange={(e) => {
            setDraft(e.target.value);
          }}
          onBlur={commit}
        />
      ) : (
        <input
          value={draft}
          disabled={disabled}
          placeholder={placeholder}
          onChange={(e) => {
            setDraft(e.target.value);
          }}
          onBlur={commit}
          onKeyDown={(e) => {
            if (e.key === "Enter") commit();
          }}
        />
      )}
    </label>
  );
}

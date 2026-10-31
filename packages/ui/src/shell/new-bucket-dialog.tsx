// SPDX-License-Identifier: Apache-2.0

import { BUCKET_COLORS, PRESETS, type BucketPresetId } from "@buckets/core";
import { useState, type ReactElement, type SubmitEvent } from "react";
import { t } from "../i18n";
import { bucketPaint } from "../tokens/index";
import { Dialog } from "./dialog";
import { ICON_CHOICES, iconGlyph } from "./icons";

/** What the user chose for a new bucket. */
export interface NewBucketChoice {
  /** Name, already trimmed and not blank. */
  name: string;
  /** Starting rules. */
  preset: Exclude<BucketPresetId, "custom">;
  /** Icon name. */
  icon: string;
  /** Color name. */
  color: string;
}

/** Props for {@link NewBucketDialog}. */
export interface NewBucketDialogProps {
  /** Whether it is showing. */
  open: boolean;
  /** Called with the choices when the user creates the bucket. */
  onCreate: (choice: NewBucketChoice) => void;
  /** Called when the user backs out. */
  onCancel: () => void;
}

/**
 * The sheet for making a bucket: a name, how it works, an icon and a color.
 *
 * @param props - See {@link NewBucketDialogProps}.
 * @returns The dialog.
 */
export function NewBucketDialog({ open, onCreate, onCancel }: NewBucketDialogProps): ReactElement {
  return (
    <Dialog open={open} onClose={onCancel} title={t("bucket.newTitle")} testId="new-bucket-dialog">
      <NewBucketForm onCreate={onCreate} onCancel={onCancel} />
    </Dialog>
  );
}

function NewBucketForm({
  onCreate,
  onCancel,
}: Pick<NewBucketDialogProps, "onCreate" | "onCancel">): ReactElement {
  const [name, setName] = useState("");
  const [preset, setPreset] = useState<NewBucketChoice["preset"]>("grab-and-go");
  const [icon, setIcon] = useState("bucket");
  const [color, setColor] = useState("accent");

  const submit = (event: SubmitEvent<HTMLFormElement>): void => {
    event.preventDefault();
    if (name.trim() === "") return;
    onCreate({ name: name.trim(), preset, icon, color });
  };

  return (
    <form onSubmit={submit} style={{ display: "grid", gap: "var(--space-3)" }}>
      <label style={{ display: "grid", gap: "var(--space-1)" }}>
        {t("bucket.nameLabel")}
        <input
          value={name}
          onChange={(e) => {
            setName(e.target.value);
          }}
          placeholder={t("bucket.namePlaceholder")}
        />
      </label>
      <fieldset
        style={{ border: 0, padding: 0, margin: 0, display: "grid", gap: "var(--space-1)" }}
      >
        <legend>{t("bucket.typeLabel")}</legend>
        {(Object.keys(PRESETS) as NewBucketChoice["preset"][]).map((id) => (
          <label
            key={id}
            style={{ display: "flex", gap: "var(--space-2)", alignItems: "baseline" }}
          >
            <input
              type="radio"
              name="preset"
              checked={preset === id}
              onChange={() => {
                setPreset(id);
              }}
            />
            <strong>{PRESETS[id].name}</strong>
            <small style={{ color: "var(--text-2)" }}>{PRESETS[id].summary}</small>
          </label>
        ))}
      </fieldset>
      <fieldset style={{ border: 0, padding: 0, margin: 0 }}>
        <legend>{t("bucket.iconLabel")}</legend>
        <div style={{ display: "flex", flexWrap: "wrap", gap: "var(--space-1)" }}>
          {ICON_CHOICES.map((choice) => (
            <label key={choice}>
              <input
                type="radio"
                name="icon"
                className="sr-only"
                checked={icon === choice}
                onChange={() => {
                  setIcon(choice);
                }}
                aria-label={t("bucket.iconOption", { icon: choice })}
              />
              <span
                aria-hidden="true"
                style={{
                  padding: "var(--space-1)",
                  borderRadius: "var(--r-s)",
                  background: icon === choice ? "var(--fill-strong)" : "transparent",
                  cursor: "pointer",
                }}
              >
                {iconGlyph(choice)}
              </span>
            </label>
          ))}
        </div>
      </fieldset>
      <fieldset style={{ border: 0, padding: 0, margin: 0 }}>
        <legend>{t("bucket.colorLabel")}</legend>
        <div style={{ display: "flex", gap: "var(--space-2)" }}>
          {BUCKET_COLORS.map((choice) => (
            <label key={choice}>
              <input
                type="radio"
                name="color"
                className="sr-only"
                checked={color === choice}
                onChange={() => {
                  setColor(choice);
                }}
                aria-label={t("bucket.colorOption", { color: choice })}
              />
              <span
                aria-hidden="true"
                style={{
                  display: "inline-block",
                  width: 22,
                  height: 22,
                  borderRadius: "50%",
                  background: bucketPaint(choice, "light").enamel,
                  outline: color === choice ? "2px solid var(--text)" : "none",
                  outlineOffset: 2,
                  cursor: "pointer",
                }}
              />
            </label>
          ))}
        </div>
      </fieldset>
      <div style={{ display: "flex", justifyContent: "flex-end", gap: "var(--space-2)" }}>
        <button type="button" onClick={onCancel}>
          {t("shell.cancel")}
        </button>
        <button type="submit" disabled={name.trim() === ""}>
          {t("shell.create")}
        </button>
      </div>
    </form>
  );
}

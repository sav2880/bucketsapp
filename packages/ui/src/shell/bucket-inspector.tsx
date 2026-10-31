// SPDX-License-Identifier: Apache-2.0

import {
  BUCKET_COLORS,
  PRESETS,
  duration,
  renameBucket,
  setBucketColor,
  setBucketIcon,
  setRules,
  setTimeZone,
  type Bucket,
  type BucketRules,
} from "@buckets/core";
import { useState, type ReactElement, type ReactNode } from "react";
import { useActions } from "../app-environment";
import { t } from "../i18n";
import { useLibraryStore } from "../library/library-provider";
import { ConfirmDialog } from "./confirm-dialog";
import { ICON_CHOICES, iconGlyph } from "./icons";
import { TextField } from "./text-field";

/** Props for {@link BucketInspector}. */
export interface BucketInspectorProps {
  /** The bucket. */
  bucket: Bucket;
  /** Whether the current member may change it. */
  canEdit: boolean;
  /** Called after the bucket is deleted. */
  onDeleted: () => void;
}

/** Changes to apply to the rules; `undefined` removes an optional rule. */
type RulePatch = { [K in keyof BucketRules]?: BucketRules[K] | undefined };

/** Applies a patch to the rules, leaving out removed optional rules (Automerge cannot store `undefined`). */
function patchRules(rules: BucketRules, patch: RulePatch): BucketRules {
  const next: Record<string, unknown> = { ...rules };
  for (const [key, value] of Object.entries(patch)) {
    if (value === undefined) Reflect.deleteProperty(next, key);
    else next[key] = value;
  }
  return next as unknown as BucketRules;
}

function Field({ label, children }: { label: string; children: ReactNode }): ReactElement {
  return (
    <label style={{ display: "grid", gap: "var(--space-1)" }}>
      {label}
      {children}
    </label>
  );
}

function days(value: { value: number } | undefined): string {
  return value === undefined ? "" : String(value.value);
}

/**
 * Details of a bucket: name, icon, color, type and every rule.
 *
 * @param props - See {@link BucketInspectorProps}.
 * @returns The details.
 */
export function BucketInspector({
  bucket,
  canEdit,
  onDeleted,
}: BucketInspectorProps): ReactElement {
  const actions = useActions();
  const store = useLibraryStore();
  const [error, setError] = useState("");
  const [confirming, setConfirming] = useState(false);
  const rules = bucket.rules;

  const changeRules = (patch: RulePatch): void => {
    const result = actions.run(bucket.id, (b, ctx) => setRules(b, patchRules(b.rules, patch), ctx));
    setError(result.ok ? "" : t("rules.invalid"));
  };
  const toggle = (key: keyof BucketRules, label: string): ReactElement => (
    <label style={{ display: "flex", gap: "var(--space-2)" }}>
      <input
        type="checkbox"
        checked={rules[key] === true}
        disabled={!canEdit}
        onChange={(e) => {
          changeRules({ [key]: e.target.checked });
        }}
      />
      {label}
    </label>
  );
  const whole = (key: "drawCount" | "maxInHand", label: string): ReactElement => (
    <Field label={label}>
      <input
        key={`${key}-${String(rules[key])}`}
        type="number"
        min={1}
        step={1}
        defaultValue={rules[key]}
        disabled={!canEdit}
        onBlur={(e) => {
          if (Number(e.target.value) !== rules[key]) changeRules({ [key]: Number(e.target.value) });
        }}
      />
    </Field>
  );
  const daysField = (key: "cooldown" | "cycleResetAfter", label: string): ReactElement => (
    <Field label={label}>
      <input
        key={`${key}-${days(rules[key])}`}
        type="number"
        min={0}
        step={1}
        defaultValue={days(rules[key])}
        disabled={!canEdit}
        onBlur={(e) => {
          const n = e.target.value === "" ? undefined : Number(e.target.value);
          if (String(n ?? "") !== days(rules[key]))
            changeRules({ [key]: n === undefined ? undefined : duration(n, "days") });
        }}
      />
    </Field>
  );
  const select = <K extends "inHandScope" | "onDone" | "selection" | "tossBackConfirm">(
    key: K,
    label: string,
    options: [BucketRules[K], string][],
  ): ReactElement => (
    <Field label={label}>
      <select
        value={rules[key]}
        disabled={!canEdit}
        onChange={(e) => {
          changeRules({ [key]: e.target.value });
        }}
      >
        {options.map(([value, text]) => (
          <option key={value} value={value}>
            {text}
          </option>
        ))}
      </select>
    </Field>
  );

  return (
    <div style={{ display: "grid", gap: "var(--space-3)" }} data-testid="bucket-inspector">
      <TextField
        key={`name-${bucket.name}`}
        label={t("bucket.nameLabel")}
        value={bucket.name}
        disabled={!canEdit}
        onCommit={(v) => {
          actions.run(bucket.id, (b, ctx) => renameBucket(b, v, ctx));
        }}
      />
      <Field label={t("bucket.iconLabel")}>
        <select
          value={bucket.icon}
          disabled={!canEdit}
          onChange={(e) => {
            actions.run(bucket.id, (b, ctx) => setBucketIcon(b, e.target.value, ctx));
          }}
        >
          {[...new Set([...ICON_CHOICES, bucket.icon])].map((icon) => (
            <option key={icon} value={icon}>
              {icon === "bucket" ? `${iconGlyph(icon)} ${t("shell.buckets")}` : icon}
            </option>
          ))}
        </select>
      </Field>
      <Field label={t("bucket.colorLabel")}>
        <select
          value={bucket.color}
          disabled={!canEdit}
          onChange={(e) => {
            actions.run(bucket.id, (b, ctx) => setBucketColor(b, e.target.value, ctx));
          }}
        >
          {BUCKET_COLORS.map((color) => (
            <option key={color} value={color}>
              {color}
            </option>
          ))}
        </select>
      </Field>
      <Field label={t("bucket.preset")}>
        <select
          value={bucket.preset}
          disabled={!canEdit}
          onChange={(e) => {
            const preset = PRESETS[e.target.value as keyof typeof PRESETS];
            actions.run(bucket.id, (b, ctx) => setRules(b, { ...preset.rules }, ctx));
          }}
        >
          {bucket.preset === "custom" && <option value="custom">{t("bucket.presetCustom")}</option>}
          {(Object.keys(PRESETS) as (keyof typeof PRESETS)[]).map((id) => (
            <option key={id} value={id}>
              {PRESETS[id].name}
            </option>
          ))}
        </select>
      </Field>
      <fieldset
        style={{ border: 0, padding: 0, margin: 0, display: "grid", gap: "var(--space-2)" }}
      >
        <legend>{t("inspector.rules")}</legend>
        {whole("drawCount", t("rules.drawCount"))}
        {whole("maxInHand", t("rules.maxInHand"))}
        {select("inHandScope", t("rules.inHandScope"), [
          ["bucket", t("rules.scope.bucket")],
          ["per-member", t("rules.scope.perMember")],
        ])}
        {toggle("lockUntilResolved", t("rules.lockUntilResolved"))}
        {select("onDone", t("rules.onDone"), [
          ["remove", t("rules.onDone.remove")],
          ["return", t("rules.onDone.return")],
        ])}
        {toggle("requireAllSteps", t("rules.requireAllSteps"))}
        {toggle("resetStepsOnReturn", t("rules.resetStepsOnReturn"))}
        <Field label={t("rules.autoReturnAt")}>
          <input
            type="time"
            value={rules.autoReturnAt ?? ""}
            disabled={!canEdit}
            onChange={(e) => {
              changeRules({ autoReturnAt: e.target.value === "" ? undefined : e.target.value });
            }}
          />
        </Field>
        <label style={{ display: "flex", gap: "var(--space-2)" }}>
          <input
            type="checkbox"
            checked={rules.noRepeat === "until-cycle-complete"}
            disabled={!canEdit}
            onChange={(e) => {
              changeRules({ noRepeat: e.target.checked ? "until-cycle-complete" : "off" });
            }}
          />
          {t("rules.noRepeat")}
        </label>
        {toggle("favorUndrawn", t("rules.favorUndrawn"))}
        {toggle("tossBackCountsAsDrawn", t("rules.tossBackCountsAsDrawn"))}
        {select("selection", t("rules.selection"), [
          ["uniform", t("rules.selection.uniform")],
          ["weighted", t("rules.selection.weighted")],
          ["aging", t("rules.selection.aging")],
          ["round-robin", t("rules.selection.round-robin")],
        ])}
        {toggle("hideTitlesUntilDrawn", t("rules.hideTitlesUntilDrawn"))}
        {select("tossBackConfirm", t("rules.tossBackConfirm"), [
          ["none", t("rules.tossBack.none")],
          ["simple", t("rules.tossBack.simple")],
          ["deliberate", t("rules.tossBack.deliberate")],
        ])}
        {daysField("cooldown", t("rules.cooldownDays"))}
        {daysField("cycleResetAfter", t("rules.cycleResetDays"))}
        {error !== "" && (
          <p role="alert" style={{ color: "var(--danger)", margin: 0 }}>
            {error}
          </p>
        )}
      </fieldset>
      <TextField
        key={`zone-${bucket.timeZone ?? ""}`}
        label={t("bucket.timeZone")}
        value={bucket.timeZone ?? "UTC"}
        disabled={!canEdit}
        placeholder="America/New_York"
        onCommit={(v) => {
          const result = actions.run(bucket.id, (b, ctx) => setTimeZone(b, v.trim(), ctx));
          setError(result.ok ? "" : t("bucket.timeZoneInvalid"));
        }}
      />
      <section>
        <h3 style={{ fontSize: "0.9em", color: "var(--text-2)" }}>{t("inspector.reminders")}</h3>
        <p style={{ color: "var(--text-2)" }}>{t("inspector.comingLater")}</p>
      </section>
      <section>
        <h3 style={{ fontSize: "0.9em", color: "var(--text-2)" }}>{t("inspector.members")}</h3>
        <p style={{ color: "var(--text-2)" }}>{t("inspector.comingLater")}</p>
      </section>
      <button
        type="button"
        onClick={() => {
          setConfirming(true);
        }}
        style={{ color: "var(--danger)" }}
        data-testid="delete-bucket"
      >
        {t("bucket.delete")}
      </button>
      <ConfirmDialog
        open={confirming}
        title={t("bucket.deleteTitle", { name: bucket.name })}
        confirmLabel={t("shell.delete")}
        danger
        onCancel={() => {
          setConfirming(false);
        }}
        onConfirm={() => {
          setConfirming(false);
          void store.removeBucket(bucket.id).then(onDeleted);
        }}
      >
        <p>{t("bucket.deleteBody")}</p>
      </ConfirmDialog>
    </div>
  );
}

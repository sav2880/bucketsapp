// SPDX-License-Identifier: Apache-2.0

import { canDraw, checkDraw, deriveItems, type Bucket, type DrawRefusal } from "@buckets/core";
import { useMemo, useState, type ReactElement, type ReactNode, type RefObject } from "react";
import { useActions, useEnvironment, useNow } from "../app-environment";
import { t } from "../i18n";
import { useAnnounce } from "../live-region";
import { useBucket } from "../library/library-provider";
import { BucketArt } from "./bucket-art";
import { ContentsList } from "./contents-list";
import { describeDrawRefusal, describeResolveRefusal } from "./draw-messages";
import { HandCard } from "./hand-card";
import { iconGlyph } from "./icons";
import { TossBackDialog } from "./toss-back-dialog";
import { useShortcuts } from "./use-shortcuts";
import { bucketColorVariables } from "../tokens/index";
import { usePrefersDark } from "./use-prefers-dark";

/** Props for {@link BucketView}. */
export interface BucketViewProps {
  /** The bucket to show. */
  bucketId: string;
  /** The item shown in the details pane. */
  selectedItemId: string | undefined;
  /** Called when the user picks an item. */
  onSelectItem: (itemId: string) => void;
  /** Controls at the start of the header (the narrow layout's "show buckets" button). */
  leading?: ReactNode;
  /** Controls at the end of the header (the narrow layout's "show details" button). */
  trailing?: ReactNode;
  /** Lets the shell focus the "add an item" box. */
  addInputRef: RefObject<HTMLInputElement | null>;
}

/**
 * The middle pane: the bucket, a Draw button, what is in hand, and what is still inside.
 * Plain on purpose; the art and animation come in M3 (plan.md §15).
 *
 * @param props - See {@link BucketViewProps}.
 * @returns The pane.
 */
export function BucketView(props: BucketViewProps): ReactElement | null {
  const bucket = useBucket(props.bucketId);
  return bucket === undefined ? null : <BucketPane {...props} bucket={bucket} />;
}

function BucketPane({
  bucket,
  bucketId,
  selectedItemId,
  onSelectItem,
  leading,
  trailing,
  addInputRef,
}: BucketViewProps & { bucket: Bucket }): ReactElement {
  const environment = useEnvironment();
  const actions = useActions();
  const announce = useAnnounce();
  const now = useNow();
  const dark = usePrefersDark();
  const [notice, setNotice] = useState("");
  const [tossing, setTossing] = useState<string | undefined>(undefined);
  const states = useMemo(() => deriveItems(bucket, now), [bucket, now]);

  const role = bucket.members[environment.memberId]?.role;
  const check = checkDraw(bucket, environment.memberId, now);
  const refusal: DrawRefusal | undefined = check.ok ? undefined : check;
  const when = (iso: string): string =>
    new Intl.DateTimeFormat(undefined, {
      dateStyle: "medium",
      timeStyle: "short",
      ...(bucket.timeZone === undefined ? {} : { timeZone: bucket.timeZone }),
    }).format(new Date(iso));
  const hint = refusal === undefined ? "" : describeDrawRefusal(refusal, when);

  const inHand = states.filter((s) => s.status === "hand");
  const mine = inHand.filter((s) => s.heldBy === environment.memberId);
  const others = inHand.filter((s) => s.heldBy !== environment.memberId);
  const titleOf = (itemId: string): string => bucket.items[itemId]?.title ?? "";

  const say = (message: string): void => {
    setNotice(message);
    announce(message);
  };

  const drawNow = (): void => {
    const result = actions.draw(bucketId);
    if (!result.ok) {
      say(describeDrawRefusal(result, when));
      return;
    }
    const drew = t("draw.drew", { titles: result.itemIds.map(titleOf).join(", ") });
    say(result.cycleReset ? `${drew} ${t("draw.newCycle")}` : drew);
  };

  const finish = (itemId: string, kind: "done" | "tossed-back", note?: string): void => {
    const title = titleOf(itemId);
    const result = actions.resolveItem(bucketId, itemId, kind, note);
    if (!result.ok) {
      say(describeResolveRefusal(result));
      return;
    }
    say(t(kind === "done" ? "hand.finished" : "hand.tossed", { title }));
  };

  const tossBack = (itemId: string): void => {
    if (bucket.rules.tossBackConfirm === "none") finish(itemId, "tossed-back");
    else setTossing(itemId);
  };

  const first = mine[0];
  useShortcuts({
    "mod+d": refusal === undefined ? drawNow : undefined,
    "mod+enter": first
      ? () => {
          finish(first.item.id, "done");
        }
      : undefined,
    "mod+backspace": first
      ? () => {
          tossBack(first.item.id);
        }
      : undefined,
  });

  const canResolve = canDraw(role);
  const confirmMode = bucket.rules.tossBackConfirm === "deliberate" ? "deliberate" : "simple";

  return (
    <main
      aria-label={bucket.name}
      style={{
        ...bucketColorVariables(bucket.color, dark ? "dark" : "light"),
        height: "100%",
        overflowY: "auto",
        background: "var(--bg)",
      }}
    >
      <header
        style={{
          minHeight: "var(--toolbar-h)",
          display: "flex",
          alignItems: "center",
          gap: "var(--space-2)",
          padding: "0 var(--space-4)",
          borderBottom: "1px solid var(--sep)",
        }}
      >
        {leading}
        <span aria-hidden="true">{iconGlyph(bucket.icon)}</span>
        <h1 style={{ flex: 1, fontSize: "1.2em", margin: 0 }}>{bucket.name}</h1>
        {trailing}
      </header>
      <div
        style={{
          padding: "var(--space-4)",
          display: "grid",
          gap: "var(--space-4)",
          maxWidth: 720,
          margin: "0 auto",
        }}
      >
        {role === "viewer" && <p style={{ color: "var(--text-2)" }}>{t("bucket.readOnly")}</p>}
        <div style={{ display: "grid", justifyItems: "center", gap: "var(--space-2)" }}>
          <BucketArt />
          <button
            type="button"
            onClick={drawNow}
            disabled={refusal !== undefined}
            aria-describedby={hint === "" ? undefined : "draw-hint"}
            data-testid="draw"
            style={{
              background: "var(--enamel)",
              color: "var(--on-enamel)",
              border: 0,
              borderRadius: "var(--r-m)",
              padding: "var(--space-2) var(--space-6)",
              fontSize: "1.1em",
              opacity: refusal === undefined ? 1 : 0.5,
            }}
          >
            {t("draw.button")}
          </button>
          <p id="draw-hint" style={{ color: "var(--text-2)", margin: 0, minHeight: "1.4em" }}>
            {hint}
          </p>
        </div>
        {notice !== "" && (
          <p data-testid="notice" style={{ margin: 0 }}>
            {notice}
          </p>
        )}
        <section aria-label={t("hand.title")} style={{ display: "grid", gap: "var(--space-2)" }}>
          <h3 style={{ margin: 0, fontSize: "0.9em", color: "var(--text-2)" }}>
            {t("hand.title")}
          </h3>
          {inHand.length === 0 && <p style={{ color: "var(--text-2)" }}>{t("hand.empty")}</p>}
          <ul
            style={{
              listStyle: "none",
              margin: 0,
              padding: 0,
              display: "grid",
              gap: "var(--space-2)",
            }}
          >
            {[...mine, ...others].map((state) => (
              <HandCard
                key={state.item.id}
                bucketId={bucketId}
                state={state}
                mine={state.heldBy === environment.memberId}
                holderName={
                  (state.heldBy === null ? undefined : bucket.members[state.heldBy]?.displayName) ??
                  ""
                }
                canResolve={
                  canResolve &&
                  (state.heldBy === environment.memberId || role === "owner" || role === "editor")
                }
                onDone={() => {
                  finish(state.item.id, "done");
                }}
                onTossBack={() => {
                  tossBack(state.item.id);
                }}
                onSelect={() => {
                  onSelectItem(state.item.id);
                }}
              />
            ))}
          </ul>
        </section>
        <ContentsList
          bucket={bucket}
          states={states}
          selectedItemId={selectedItemId}
          onSelect={onSelectItem}
          canEdit={role === "owner" || role === "editor"}
          addInputRef={addInputRef}
        />
      </div>
      <TossBackDialog
        title={tossing === undefined ? undefined : titleOf(tossing)}
        mode={confirmMode}
        onCancel={() => {
          setTossing(undefined);
        }}
        onConfirm={(reason) => {
          if (tossing !== undefined)
            finish(
              tossing,
              "tossed-back",
              bucket.sharing.tossBackReasons === "shared" ? reason : undefined,
            );
          setTossing(undefined);
        }}
      />
    </main>
  );
}

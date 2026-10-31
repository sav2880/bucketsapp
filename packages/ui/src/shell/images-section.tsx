// SPDX-License-Identifier: Apache-2.0

import {
  addAttachment,
  removeAttachment,
  setAttachmentAlt,
  type Attachment,
  type Bucket,
  type Item,
} from "@buckets/core";
import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type ClipboardEvent,
  type DragEvent,
  type ReactElement,
} from "react";
import { useActions, useEnvironment } from "../app-environment";
import { t } from "../i18n";
import { createBrowserCodec } from "../images/browser-codec";
import {
  ACCEPT_ATTRIBUTE,
  processImage,
  type ImageFailure,
  type ProcessedImage,
} from "../images/process-image";
import { useBlobUrl } from "../images/use-blob-url";
import { useAnnounce } from "../live-region";
import { Dialog } from "./dialog";
import { TextField } from "./text-field";

/** Props for {@link ImagesSection}. */
export interface ImagesSectionProps {
  /** The bucket the item is in. */
  bucket: Bucket;
  /** The item. */
  item: Item;
  /** Whether the current member may change images. */
  canEdit: boolean;
}

type Ready = Extract<ProcessedImage, { ok: true }>;
type Pending = Ready & { url: string };

function Thumbnail({
  attachment,
  onOpen,
}: {
  attachment: Attachment;
  onOpen: () => void;
}): ReactElement {
  const url = useBlobUrl(attachment.blobId, attachment.mime);
  const alt = attachment.alt ?? "";
  return (
    <button
      type="button"
      onClick={onOpen}
      aria-label={t("images.view", { alt: alt === "" ? t("images.noAlt") : alt })}
      style={{
        padding: 0,
        border: 0,
        background: "var(--fill)",
        borderRadius: "var(--r-s)",
        width: 72,
        height: 72,
        overflow: "hidden",
      }}
    >
      {url !== undefined && (
        <img src={url} alt={alt} style={{ width: "100%", height: "100%", objectFit: "cover" }} />
      )}
    </button>
  );
}

function Larger({ attachment }: { attachment: Attachment }): ReactElement {
  const url = useBlobUrl(attachment.blobId, attachment.mime);
  return url === undefined ? (
    <></>
  ) : (
    <img
      src={url}
      alt={attachment.alt ?? ""}
      style={{ maxWidth: "100%", maxHeight: "70vh", display: "block", margin: "0 auto" }}
    />
  );
}

/**
 * The pictures of an item: add by choosing a file, dropping or pasting; each is scaled down and
 * stripped of metadata before it is stored, and gets a description for screen readers. Click a
 * thumbnail to see it larger.
 *
 * @param props - See {@link ImagesSectionProps}.
 * @returns The section.
 */
export function ImagesSection({ bucket, item, canEdit }: ImagesSectionProps): ReactElement {
  const actions = useActions();
  const announce = useAnnounce();
  const { blobs, imageCodec } = useEnvironment();
  const codec = useMemo(() => imageCodec ?? createBrowserCodec(), [imageCodec]);
  const picker = useRef<HTMLInputElement>(null);
  const [failure, setFailure] = useState<ImageFailure | undefined>(undefined);
  const [pending, setPending] = useState<Pending | undefined>(undefined);
  const [alt, setAlt] = useState("");
  const [viewing, setViewing] = useState<string | undefined>(undefined);

  // The preview URL belongs to the pending picture; free it when that goes away.
  const latest = useRef<Pending | undefined>(undefined);
  useEffect(() => {
    latest.current = pending;
  });
  useEffect(
    () => () => {
      if (latest.current) URL.revokeObjectURL(latest.current.url);
    },
    [],
  );
  const closePending = (): void => {
    if (pending) URL.revokeObjectURL(pending.url);
    setPending(undefined);
  };

  const receive = async (files: readonly File[]): Promise<void> => {
    const file = files[0];
    if (file === undefined) return;
    const result = await processImage(file, codec);
    if (!result.ok) {
      setFailure(result.reason);
      announce(t(`images.error.${result.reason}`));
      return;
    }
    setFailure(undefined);
    setAlt("");
    if (pending) URL.revokeObjectURL(pending.url);
    setPending({
      ...result,
      url: URL.createObjectURL(new Blob([result.bytes.slice()], { type: result.mime })),
    });
  };

  const save = async (): Promise<void> => {
    if (pending === undefined) return;
    const blobId = await blobs.put(pending.bytes);
    actions.run(bucket.id, (b, ctx) =>
      addAttachment(
        b,
        item.id,
        {
          blobId,
          mime: pending.mime,
          width: pending.width,
          height: pending.height,
          bytes: pending.bytes.length,
          alt,
        },
        ctx,
      ),
    );
    closePending();
  };

  const onDrop = (event: DragEvent<HTMLElement>): void => {
    if (!canEdit || !event.dataTransfer.types.includes("Files")) return;
    event.preventDefault();
    void receive([...event.dataTransfer.files]);
  };
  const onPaste = (event: ClipboardEvent<HTMLElement>): void => {
    const files = [...event.clipboardData.files].filter((f) => f.type.startsWith("image/"));
    if (!canEdit || files.length === 0) return;
    event.preventDefault();
    void receive(files);
  };

  const shown = viewing === undefined ? undefined : item.attachments.find((a) => a.id === viewing);

  return (
    <fieldset
      style={{ border: 0, padding: 0, margin: 0, display: "grid", gap: "var(--space-2)" }}
      onDragOver={(e) => {
        if (canEdit && e.dataTransfer.types.includes("Files")) e.preventDefault();
      }}
      onDrop={onDrop}
      onPaste={onPaste}
    >
      <legend>{t("images.title")}</legend>
      <ul
        style={{ listStyle: "none", margin: 0, padding: 0, display: "grid", gap: "var(--space-2)" }}
      >
        {item.attachments.map((attachment) => (
          <li
            key={attachment.id}
            style={{ display: "flex", gap: "var(--space-2)", alignItems: "flex-start" }}
          >
            <Thumbnail
              attachment={attachment}
              onOpen={() => {
                setViewing(attachment.id);
              }}
            />
            <div style={{ flex: 1, display: "grid", gap: "var(--space-1)" }}>
              <TextField
                key={`${attachment.id}-${attachment.alt ?? ""}`}
                label={t("images.altOf", { alt: attachment.alt ?? t("images.noAlt") })}
                value={attachment.alt ?? ""}
                disabled={!canEdit}
                onCommit={(v) => {
                  actions.run(bucket.id, (b, ctx) =>
                    setAttachmentAlt(b, item.id, attachment.id, v, ctx),
                  );
                }}
              />
              {canEdit && (
                <button
                  type="button"
                  aria-label={t("images.remove", { alt: attachment.alt ?? t("images.noAlt") })}
                  onClick={() => {
                    actions.run(bucket.id, (b, ctx) =>
                      removeAttachment(b, item.id, attachment.id, ctx),
                    );
                  }}
                >
                  ×
                </button>
              )}
            </div>
          </li>
        ))}
      </ul>
      {canEdit && (
        <>
          <input
            ref={picker}
            type="file"
            accept={ACCEPT_ATTRIBUTE}
            className="sr-only"
            tabIndex={-1}
            aria-label={t("images.choose")}
            data-testid="image-file"
            onChange={(e) => {
              void receive([...(e.target.files ?? [])]);
              e.target.value = "";
            }}
          />
          <button
            type="button"
            onClick={() => {
              picker.current?.click();
            }}
          >
            {t("images.choose")}
          </button>
          <small style={{ color: "var(--text-2)" }}>{t("images.dropHint")}</small>
        </>
      )}
      {failure !== undefined && (
        <p role="alert" style={{ color: "var(--danger)", margin: 0 }}>
          {t(`images.error.${failure}`)}
        </p>
      )}
      <Dialog open={pending !== undefined} onClose={closePending} title={t("images.choose")}>
        {pending !== undefined && (
          <img
            src={pending.url}
            alt={t("images.previewOf")}
            style={{
              maxWidth: "100%",
              maxHeight: "40vh",
              display: "block",
              margin: "0 auto var(--space-3)",
            }}
          />
        )}
        <TextField label={t("images.altLabel")} value={alt} onCommit={setAlt} placeholder="" />
        <small style={{ color: "var(--text-2)" }}>{t("images.altHelp")}</small>
        <div
          style={{
            display: "flex",
            justifyContent: "flex-end",
            gap: "var(--space-2)",
            marginTop: "var(--space-3)",
          }}
        >
          <button type="button" onClick={closePending}>
            {t("shell.cancel")}
          </button>
          <button
            type="button"
            data-testid="save-image"
            onClick={() => {
              void save();
            }}
          >
            {t("images.save")}
          </button>
        </div>
      </Dialog>
      <Dialog
        open={shown !== undefined}
        onClose={() => {
          setViewing(undefined);
        }}
        title={shown?.alt ?? t("images.title")}
      >
        {shown !== undefined && <Larger attachment={shown} />}
      </Dialog>
    </fieldset>
  );
}

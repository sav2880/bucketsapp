// SPDX-License-Identifier: Apache-2.0

import { addLink, removeLink, setLinkTitle, type Bucket, type Item } from "@buckets/core";
import { useState, type ReactElement } from "react";
import { useActions } from "../app-environment";
import { t } from "../i18n";
import { TextField } from "./text-field";

/** Props for {@link LinksSection}. */
export interface LinksSectionProps {
  /** The bucket the item is in. */
  bucket: Bucket;
  /** The item. */
  item: Item;
  /** Whether the current member may change links. */
  canEdit: boolean;
}

/**
 * The links of an item. Only web and email addresses are accepted, and they are never
 * fetched. On the web they open in a new tab; every platform can copy them (the desktop app
 * cannot open them yet).
 *
 * @param props - See {@link LinksSectionProps}.
 * @returns The section.
 */
export function LinksSection({ bucket, item, canEdit }: LinksSectionProps): ReactElement {
  const actions = useActions();
  const [url, setUrl] = useState("");
  const [error, setError] = useState("");

  return (
    <fieldset style={{ border: 0, padding: 0, margin: 0, display: "grid", gap: "var(--space-1)" }}>
      <legend>{t("links.title")}</legend>
      <ul
        style={{ listStyle: "none", margin: 0, padding: 0, display: "grid", gap: "var(--space-2)" }}
      >
        {item.links.map((link) => {
          const name = link.title ?? link.url;
          return (
            <li key={link.id} style={{ display: "grid", gap: "var(--space-1)" }}>
              <div style={{ display: "flex", gap: "var(--space-2)", alignItems: "center" }}>
                <a
                  href={link.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  aria-label={t("links.openIn", { title: name })}
                  style={{
                    flex: 1,
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                    color: "var(--accent)",
                  }}
                >
                  {name}
                </a>
                <button
                  type="button"
                  aria-label={t("links.copyOf", { title: name })}
                  onClick={() => {
                    void navigator.clipboard.writeText(link.url);
                  }}
                >
                  {t("links.copy")}
                </button>
                {canEdit && (
                  <button
                    type="button"
                    aria-label={t("links.remove", { title: name })}
                    onClick={() => {
                      actions.run(bucket.id, (b, ctx) => removeLink(b, item.id, link.id, ctx));
                    }}
                  >
                    ×
                  </button>
                )}
              </div>
              {canEdit && (
                <TextField
                  key={`${link.id}-${link.title ?? ""}`}
                  label={t("links.label", { url: link.url })}
                  value={link.title ?? ""}
                  onCommit={(v) => {
                    actions.run(bucket.id, (b, ctx) => setLinkTitle(b, item.id, link.id, v, ctx));
                  }}
                />
              )}
            </li>
          );
        })}
      </ul>
      {canEdit && (
        <form
          onSubmit={(event) => {
            event.preventDefault();
            const result = actions.run(bucket.id, (b, ctx) => addLink(b, item.id, url, ctx));
            setError(result.ok ? "" : t("links.invalid"));
            if (result.ok) setUrl("");
          }}
        >
          <input
            value={url}
            onChange={(e) => {
              setUrl(e.target.value);
            }}
            placeholder={t("links.placeholder")}
            aria-label={t("links.add")}
            style={{ width: "100%" }}
          />
          {error !== "" && (
            <p role="alert" style={{ color: "var(--danger)", margin: 0 }}>
              {error}
            </p>
          )}
        </form>
      )}
    </fieldset>
  );
}

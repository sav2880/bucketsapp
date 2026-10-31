// SPDX-License-Identifier: Apache-2.0

import type { SettingsStore } from "@buckets/storage";
import { useEffect, useState, type ReactElement, type ReactNode } from "react";
import { Group, Panel, Separator, type Layout } from "react-resizable-panels";
import { t } from "../i18n";

/** One pane of a {@link ResizableLayout}. */
export interface PaneSpec {
  /** Stable id; keys the saved size. */
  id: string;
  /** Name shown to screen readers on the divider next to it. */
  label: string;
  /** What the pane shows. */
  content: ReactNode;
  /** Starting width in pixels. Leave out for the pane that takes the remaining space. */
  defaultSize?: number;
  /** Narrowest width in pixels. */
  minSize: number;
  /** Widest width in pixels. */
  maxSize?: number;
  /** Dragging past the minimum collapses the pane. */
  collapsible?: boolean;
}

/** Props for {@link ResizableLayout}. */
export interface ResizableLayoutProps {
  /** Names this layout in the saved settings. */
  id: string;
  /** Panes from left to right. Exactly one should have no `defaultSize`; it fills the space. */
  panes: readonly PaneSpec[];
  /** Where sizes are saved. Without it, sizes reset on every launch. */
  settings?: SettingsStore | undefined;
}

const settingKey = (id: string): string => `layout-${id}`;

function isLayout(value: unknown): value is Layout {
  return (
    typeof value === "object" &&
    value !== null &&
    Object.values(value).every((n) => typeof n === "number" && Number.isFinite(n))
  );
}

/**
 * Side-by-side panes with draggable dividers. Each pane has limits and may collapse; double-click
 * a divider to put its pane back to the default width. Sizes are saved and restored.
 *
 * @param props - See {@link ResizableLayoutProps}.
 * @returns The panes.
 */
export function ResizableLayout({
  id,
  panes,
  settings,
}: ResizableLayoutProps): ReactElement | null {
  // `undefined` while the saved sizes load; `null` when there are none.
  const [saved, setSaved] = useState<Layout | null | undefined>(
    settings === undefined ? null : undefined,
  );

  useEffect(() => {
    if (settings === undefined) return;
    let current = true;
    void settings.get(settingKey(id)).then((value) => {
      if (current) setSaved(isLayout(value) ? value : null);
    });
    return () => {
      current = false;
    };
  }, [id, settings]);

  // Wait for the saved sizes so the panes don't jump after the first paint.
  if (saved === undefined) return null;

  return (
    <Group
      id={id}
      orientation="horizontal"
      {...(saved === null ? {} : { defaultLayout: saved })}
      onLayoutChanged={(layout, meta) => {
        if (meta.isUserInteraction)
          void settings?.set(settingKey(id), meta.requestedLayout ?? layout);
      }}
      style={{ height: "100%" }}
    >
      {panes.map((pane, i) => (
        <PaneWithDivider
          key={pane.id}
          pane={pane}
          divider={i > 0 ? (panes[i - 1]?.label ?? pane.label) : undefined}
        />
      ))}
    </Group>
  );
}

function PaneWithDivider({
  pane,
  divider,
}: {
  pane: PaneSpec;
  divider: string | undefined;
}): ReactElement {
  const resizable = pane.defaultSize !== undefined;
  return (
    <>
      {divider !== undefined && (
        <Separator aria-label={t("layout.resize", { name: resizable ? pane.label : divider })} />
      )}
      <Panel
        id={pane.id}
        minSize={pane.minSize}
        {...(pane.defaultSize === undefined
          ? {}
          : { defaultSize: pane.defaultSize, groupResizeBehavior: "preserve-pixel-size" as const })}
        {...(pane.maxSize === undefined ? {} : { maxSize: pane.maxSize })}
        {...(pane.collapsible ? { collapsible: true, collapsedSize: 0 } : {})}
      >
        {pane.content}
      </Panel>
    </>
  );
}

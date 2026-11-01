// SPDX-License-Identifier: Apache-2.0

import { useRef, useState, type ReactElement } from "react";
import { StoredMotionSettingProvider } from "../hooks/use-motion-setting";
import { useActions, useEnvironment } from "../app-environment";
import { ResizableLayout, type PaneSpec } from "../layout/resizable-layout";
import { useLibrary } from "../library/library-provider";
import { t } from "../i18n";
import { BucketView } from "./bucket-view";
import { Dialog } from "./dialog";
import { Inspector, type InspectorMode } from "./inspector";
import { NewBucketDialog } from "./new-bucket-dialog";
import { Sidebar } from "./sidebar";
import { useShortcuts } from "./use-shortcuts";
import {
  INSPECTOR_SHEET_BELOW,
  SIDEBAR_DRAWER_BELOW,
  useViewportWidth,
} from "./use-viewport-width";

/**
 * The whole app window: buckets on the left, the selected bucket in the middle, details on
 * the right. On narrower windows the details become a slide-over sheet (below 900 px) and the
 * buckets a drawer (below 600 px), as plan.md §12.2 describes.
 *
 * Needs a `LibraryProvider`, an `EnvironmentProvider` and a `LiveRegionProvider` above it.
 *
 * @returns The shell.
 */
export function Shell(): ReactElement {
  return (
    <StoredMotionSettingProvider>
      <ShellContent />
    </StoredMotionSettingProvider>
  );
}

function ShellContent(): ReactElement {
  const { library, saveError } = useLibrary();
  const environment = useEnvironment();
  const actions = useActions();
  const width = useViewportWidth();

  const [chosenBucket, setChosenBucket] = useState<string | undefined>(undefined);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const selectedItemId = selectedIds.length === 1 ? selectedIds[0] : undefined;
  const [mode, setMode] = useState<InspectorMode>("item");
  const [newBucketOpen, setNewBucketOpen] = useState(false);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [sheetOpen, setSheetOpen] = useState(false);
  const addInputRef = useRef<HTMLInputElement>(null);

  // A deleted bucket falls back to the first one that is left.
  const bucketId =
    chosenBucket !== undefined && library.bucketOrder.includes(chosenBucket)
      ? chosenBucket
      : library.bucketOrder[0];

  const selectBucket = (id: string): void => {
    setChosenBucket(id);
    setSelectedIds([]);
    setMode("bucket");
    setDrawerOpen(false);
  };
  const changeSelection = (ids: string[]): void => {
    setSelectedIds(ids);
    if (ids.length > 0) setMode("item");
    if (ids.length === 1) setSheetOpen(width < INSPECTOR_SHEET_BELOW);
  };

  useShortcuts({
    "mod+shift+n": () => {
      setNewBucketOpen(true);
    },
    "mod+n":
      bucketId === undefined
        ? undefined
        : () => {
            addInputRef.current?.focus();
          },
    "mod+comma":
      bucketId === undefined
        ? undefined
        : () => {
            setMode("bucket");
            setSheetOpen(width < INSPECTOR_SHEET_BELOW);
          },
  });

  const sidebar = (
    <Sidebar
      selectedId={bucketId}
      onSelect={selectBucket}
      onNewBucket={() => {
        setNewBucketOpen(true);
      }}
    />
  );
  const inspector =
    bucketId === undefined ? null : (
      <Inspector
        bucketId={bucketId}
        itemId={selectedItemId}
        selectedCount={selectedIds.length}
        mode={mode}
        onModeChange={setMode}
        onItemDeleted={() => {
          setSelectedIds([]);
          setMode("bucket");
        }}
        onBucketDeleted={() => {
          setChosenBucket(undefined);
          setSelectedIds([]);
          setSheetOpen(false);
        }}
      />
    );

  const narrow = width < SIDEBAR_DRAWER_BELOW;
  const mediumOrNarrower = width < INSPECTOR_SHEET_BELOW;

  const middle =
    bucketId === undefined ? (
      <main
        style={{
          height: "100%",
          display: "grid",
          placeItems: "center",
          background: "var(--bg)",
          padding: "var(--space-4)",
        }}
      >
        <div style={{ textAlign: "center", display: "grid", gap: "var(--space-3)" }}>
          {narrow && (
            <button
              type="button"
              onClick={() => {
                setDrawerOpen(true);
              }}
            >
              {t("shell.openSidebar")}
            </button>
          )}
          <p style={{ color: "var(--text-2)" }}>{t("shell.noBucketSelected")}</p>
          <button
            type="button"
            onClick={() => {
              setNewBucketOpen(true);
            }}
          >
            {t("shell.newBucket")}
          </button>
        </div>
      </main>
    ) : (
      <BucketView
        bucketId={bucketId}
        selectedIds={selectedIds}
        onSelectedIdsChange={changeSelection}
        addInputRef={addInputRef}
        leading={
          narrow ? (
            <button
              type="button"
              onClick={() => {
                setDrawerOpen(true);
              }}
            >
              {t("shell.openSidebar")}
            </button>
          ) : undefined
        }
        trailing={
          mediumOrNarrower ? (
            <button
              type="button"
              onClick={() => {
                setSheetOpen(true);
              }}
            >
              {t("shell.openInspector")}
            </button>
          ) : undefined
        }
      />
    );

  const panes: PaneSpec[] = [];
  if (!narrow)
    panes.push({
      id: "sidebar",
      label: t("shell.buckets"),
      content: sidebar,
      defaultSize: 232,
      minSize: 180,
      maxSize: 360,
      collapsible: true,
    });
  panes.push({ id: "main", label: t("shell.buckets"), content: middle, minSize: 300 });
  if (!mediumOrNarrower)
    panes.push({
      id: "inspector",
      label: t("inspector.title"),
      content: inspector,
      defaultSize: 304,
      minSize: 260,
      maxSize: 460,
      collapsible: true,
    });

  return (
    <div style={{ height: "100%" }} data-testid="shell">
      {saveError !== undefined && (
        <p
          role="alert"
          style={{
            margin: 0,
            padding: "var(--space-2)",
            background: "var(--danger)",
            color: "var(--bg)",
          }}
        >
          {t("library.saveFailed", { message: saveError })}
        </p>
      )}
      <ResizableLayout
        id={`shell-${narrow ? "narrow" : mediumOrNarrower ? "medium" : "wide"}`}
        panes={panes}
        settings={environment.settings}
      />
      <Dialog
        open={narrow && drawerOpen}
        onClose={() => {
          setDrawerOpen(false);
        }}
        title={t("shell.buckets")}
        placement="left"
      >
        {sidebar}
      </Dialog>
      <Dialog
        open={mediumOrNarrower && sheetOpen}
        onClose={() => {
          setSheetOpen(false);
        }}
        title={t("inspector.title")}
        placement="right"
      >
        {inspector}
      </Dialog>
      <NewBucketDialog
        open={newBucketOpen}
        onCancel={() => {
          setNewBucketOpen(false);
        }}
        onCreate={(choice) => {
          setNewBucketOpen(false);
          selectBucket(actions.createBucket(choice));
        }}
      />
    </div>
  );
}

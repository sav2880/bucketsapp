// SPDX-License-Identifier: Apache-2.0

import { createCryptoRng, createLibrary } from "@buckets/core";
import {
  createBlobStore,
  createSettingsStore,
  openLibraryStore,
  type LibraryStore,
  type SettingsStore,
  type StorageAdapter,
} from "@buckets/storage";
import { useEffect, useMemo, useState, type CSSProperties, type ReactElement } from "react";
import { EnvironmentProvider, type AppEnvironment } from "./app-environment";
import { t } from "./i18n";
import { LibraryProvider } from "./library/library-provider";
import { LiveRegionProvider } from "./live-region";
import { Shell } from "./shell/shell";
import { usePrefersDark } from "./shell/use-prefers-dark";
import { cssVariables } from "./tokens/index";

/** Props for {@link AppRoot}. */
export interface AppRootProps {
  /** Where this device keeps its data: files on desktop, IndexedDB on the web. */
  storage: StorageAdapter;
}

/** What opening produced: the store and environment, or the reason there is nothing to show. */
type Booted =
  { ok: true; store: LibraryStore; environment: AppEnvironment } | { ok: false; message: string };

/** One opening per storage, so React's double effects in development don't race two openings. */
const openings = new WeakMap<StorageAdapter, Promise<Booted>>();

/**
 * Reads an id kept in the settings, making and saving one on the first run.
 *
 * @param settings - The settings store.
 * @param key - Setting name.
 * @param makeId - Makes a new id.
 * @returns The id.
 */
async function persistentId(
  settings: SettingsStore,
  key: string,
  makeId: () => string,
): Promise<string> {
  const stored = await settings.get(key);
  if (typeof stored === "string" && stored !== "") return stored;
  const fresh = makeId();
  await settings.set(key, fresh);
  return fresh;
}

async function boot(storage: StorageAdapter): Promise<Booted> {
  const makeId = (): string => crypto.randomUUID();
  const settings = createSettingsStore(storage);
  const [memberId, deviceId] = await Promise.all([
    persistentId(settings, "member-id", makeId),
    persistentId(settings, "device-id", makeId),
  ]);
  const opened = await openLibraryStore(storage, {
    newLibrary: () => createLibrary(t("profile.defaultName"), { makeId }),
  });
  if (!opened.ok) return { ok: false, message: t(`library.${camel(opened.problem.kind)}`) };
  const profile = opened.store.getState().library.profile;
  return {
    ok: true,
    store: opened.store,
    environment: {
      memberId,
      deviceId,
      displayName: profile.displayName,
      timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone,
      now: () => new Date(),
      rng: createCryptoRng((array) => {
        // Filled through a plain ArrayBuffer-backed copy: `getRandomValues` won't take shared buffers.
        const fresh = new Uint32Array(array.length);
        crypto.getRandomValues(fresh);
        array.set(fresh);
      }),
      makeId,
      blobs: createBlobStore(storage),
      settings,
    },
  };
}

function camel(
  kind: "newer-version" | "unreadable" | "missing",
): "newerVersion" | "unreadable" | "missing" {
  return kind === "newer-version" ? "newerVersion" : kind;
}

/**
 * The whole app: opens the library from `storage`, sets up the environment (ids, clock,
 * secure randomness), follows the system light or dark theme, saves when the window is
 * hidden or closed, and shows the {@link Shell}. The desktop and web apps differ only in
 * the storage they pass in.
 *
 * @param props - See {@link AppRootProps}.
 * @returns The app.
 */
export function AppRoot({ storage }: AppRootProps): ReactElement {
  const [booted, setBooted] = useState<Booted | undefined>(undefined);
  const dark = usePrefersDark();
  const theme = dark ? "dark" : "light";
  const variables = useMemo(() => cssVariables(theme), [theme]);

  // The base stylesheet paints the page from these, so they go on the root element.
  useEffect(() => {
    const root = document.documentElement;
    for (const [name, value] of Object.entries(variables)) root.style.setProperty(name, value);
    root.style.colorScheme = theme;
  }, [variables, theme]);

  useEffect(() => {
    let live = true;
    let opening = openings.get(storage);
    if (opening === undefined) {
      opening = boot(storage);
      openings.set(storage, opening);
    }
    void opening.then((result) => {
      if (live) setBooted(result);
    });
    return () => {
      live = false;
    };
  }, [storage]);

  const store = booted?.ok === true ? booted.store : undefined;
  useEffect(() => {
    if (store === undefined) return;
    // A failed save is shown by the shell through `saveError`, so the rejection adds nothing.
    const save = (): void => {
      void store.flush().catch(() => undefined);
    };
    const onVisibility = (): void => {
      if (document.visibilityState === "hidden") save();
    };
    document.addEventListener("visibilitychange", onVisibility);
    window.addEventListener("pagehide", save);
    return () => {
      document.removeEventListener("visibilitychange", onVisibility);
      window.removeEventListener("pagehide", save);
    };
  }, [store]);

  const centered: CSSProperties = { height: "100%", display: "grid", placeItems: "center" };
  if (booted === undefined) return <p style={{ ...centered, margin: 0 }}>{t("library.loading")}</p>;
  if (!booted.ok)
    return (
      <p role="alert" style={{ ...centered, margin: 0 }}>
        {booted.message}
      </p>
    );
  return (
    <EnvironmentProvider environment={booted.environment}>
      <LibraryProvider store={booted.store}>
        <LiveRegionProvider>
          <Shell />
        </LiveRegionProvider>
      </LibraryProvider>
    </EnvironmentProvider>
  );
}

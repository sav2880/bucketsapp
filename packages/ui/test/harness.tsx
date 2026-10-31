// SPDX-License-Identifier: Apache-2.0

import { createLibrary, createSeededRng, type MemberRole } from "@buckets/core";
import {
  createMemoryStorage,
  createSettingsStore,
  openLibraryStore,
  type LibraryStore,
  type StorageAdapter,
} from "@buckets/storage";
import { render } from "@testing-library/react";
import { EnvironmentProvider, type AppEnvironment } from "../src/app-environment";
import { LiveRegionProvider } from "../src/live-region";
import { LibraryProvider } from "../src/library/library-provider";
import { Shell } from "../src/shell/shell";

/** A clock the test can move. */
export interface TestClock {
  /** Current time in epoch milliseconds. */
  ms: number;
}

/** Everything {@link renderShell} makes. */
export interface ShellHarness {
  /** The open store, for setting up and checking documents. */
  store: LibraryStore;
  /** The storage under it. */
  adapter: StorageAdapter;
  /** The environment the shell runs in. */
  environment: AppEnvironment;
  /** Move this to move time. */
  clock: TestClock;
}

/** Fixed start time: 2026-10-30 09:00 UTC. */
export const START = Date.UTC(2026, 9, 30, 9);

/**
 * Pretends the window is a given width.
 *
 * @param width - CSS pixels.
 */
export function setViewportWidth(width: number): void {
  Object.defineProperty(window, "innerWidth", { configurable: true, value: width });
  window.dispatchEvent(new Event("resize"));
}

/**
 * Opens a store on memory storage and renders the shell with a fixed clock and seeded draws.
 *
 * @param options - Starting width and storage to reuse.
 * @returns The pieces, for the test to drive.
 */
export async function renderShell(
  options: { width?: number; adapter?: StorageAdapter; role?: MemberRole } = {},
): Promise<ShellHarness> {
  setViewportWidth(options.width ?? 1200);
  const adapter = options.adapter ?? createMemoryStorage();
  let n = 0;
  const makeId = (): string => `id-${String(++n)}`;
  const opened = await openLibraryStore(adapter, {
    newLibrary: () => createLibrary("Me", { makeId }),
    saveDelayMs: 1_000_000,
  });
  if (!opened.ok) throw new Error("could not open the test library");
  const clock: TestClock = { ms: START };
  const environment: AppEnvironment = {
    memberId: "me",
    deviceId: "d1",
    displayName: "Me",
    timeZone: "UTC",
    now: () => new Date(clock.ms),
    rng: createSeededRng(7),
    makeId,
    settings: createSettingsStore(adapter),
  };
  render(
    <EnvironmentProvider environment={environment}>
      <LibraryProvider store={opened.store}>
        <LiveRegionProvider>
          <Shell />
        </LiveRegionProvider>
      </LibraryProvider>
    </EnvironmentProvider>,
  );
  return { store: opened.store, adapter, environment, clock };
}

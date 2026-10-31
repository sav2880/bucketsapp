// SPDX-License-Identifier: Apache-2.0

import type { StorageAdapter } from "./adapter";

/**
 * Small per-device preferences such as pane widths. Not synced, not part of any document.
 */
export interface SettingsStore {
  /**
   * Reads a setting.
   *
   * @param key - Name (letters, digits, `.`, `_`, `-`).
   * @returns The stored JSON value, or `undefined` when unset or unreadable.
   */
  get(key: string): Promise<unknown>;
  /**
   * Stores a setting.
   *
   * @param key - Name.
   * @param value - Any JSON value.
   */
  set(key: string, value: unknown): Promise<void>;
}

/**
 * Builds a settings store on a storage adapter, under `settings/`.
 *
 * @param adapter - Where bytes live.
 * @returns The settings store.
 */
export function createSettingsStore(adapter: StorageAdapter): SettingsStore {
  return {
    async get(key) {
      const bytes = await adapter.read(`settings/${key}`);
      if (bytes === undefined) return undefined;
      try {
        return JSON.parse(new TextDecoder().decode(bytes)) as unknown;
      } catch {
        // A damaged preference should never stop the app; fall back to the default.
        return undefined;
      }
    },
    async set(key, value) {
      await adapter.write(`settings/${key}`, new TextEncoder().encode(JSON.stringify(value)));
    },
  };
}

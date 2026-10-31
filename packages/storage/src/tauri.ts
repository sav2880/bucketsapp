// SPDX-License-Identifier: Apache-2.0

import { assertValidKey, type StorageAdapter } from "./adapter";

/**
 * The shape of Tauri's `invoke`. Passed in so this package never imports Tauri (AGENTS.md §2);
 * the desktop app hands over `invoke` from `@tauri-apps/api/core`.
 */
export type InvokeFn = (
  command: string,
  args?: Uint8Array | Record<string, unknown>,
  options?: { headers: Record<string, string> },
) => Promise<unknown>;

/** Error the Rust side returns for a missing file: `{ kind: "not-found" }`. */
function isNotFound(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    (error as { kind?: unknown }).kind === "not-found"
  );
}

/**
 * Stores everything as files in the app data folder, through the Rust commands in
 * `apps/desktop/src-tauri/src/storage.rs` (plan.md §8.2). Rust writes atomically and checks
 * every path; bytes travel raw, not as JSON, so a 10 MB image is not inflated.
 *
 * @param invoke - Tauri's `invoke`.
 * @returns The adapter.
 */
export function createTauriStorage(invoke: InvokeFn): StorageAdapter {
  return {
    async read(key) {
      assertValidKey(key);
      try {
        const result = await invoke("storage_read", { key });
        if (result instanceof ArrayBuffer) return new Uint8Array(result);
        if (result instanceof Uint8Array) return result;
        throw new Error("storage_read returned something other than bytes");
      } catch (error) {
        if (isNotFound(error)) return undefined;
        throw error;
      }
    },
    async write(key, bytes) {
      assertValidKey(key);
      await invoke("storage_write", bytes, { headers: { "x-storage-key": key } });
    },
    async list(prefix) {
      assertValidKey(prefix);
      const keys = await invoke("storage_list", { prefix });
      if (!Array.isArray(keys) || !keys.every((k): k is string => typeof k === "string"))
        throw new Error("storage_list returned something other than keys");
      return keys;
    },
    async remove(key) {
      assertValidKey(key);
      await invoke("storage_remove", { key });
    },
  };
}

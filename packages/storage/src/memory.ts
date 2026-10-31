// SPDX-License-Identifier: Apache-2.0

import { assertValidKey, type StorageAdapter } from "./adapter";

/** Runs `fn` and turns a throw into a rejection, like the adapters that are truly async. */
function settle<T>(fn: () => T): Promise<T> {
  try {
    return Promise.resolve(fn());
  } catch (error) {
    return Promise.reject(error instanceof Error ? error : new Error(String(error)));
  }
}

/**
 * Keeps everything in memory. For tests, and as the fallback when a browser blocks storage.
 *
 * @returns An empty adapter.
 */
export function createMemoryStorage(): StorageAdapter {
  const values = new Map<string, Uint8Array>();
  return {
    read: (key) =>
      settle(() => {
        assertValidKey(key);
        return values.get(key)?.slice();
      }),
    write: (key, bytes) =>
      settle(() => {
        assertValidKey(key);
        values.set(key, bytes.slice());
      }),
    list: (prefix) =>
      settle(() => {
        assertValidKey(prefix);
        return [...values.keys()].filter(
          (k) => k.startsWith(`${prefix}/`) && !k.slice(prefix.length + 1).includes("/"),
        );
      }),
    remove: (key) =>
      settle(() => {
        assertValidKey(key);
        values.delete(key);
      }),
  };
}

// SPDX-License-Identifier: Apache-2.0

import { assertValidKey, type StorageAdapter } from "./adapter";

const STORE = "values";

function request<T>(req: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    req.onsuccess = () => {
      resolve(req.result);
    };
    req.onerror = () => {
      reject(req.error ?? new Error("IndexedDB request failed"));
    };
  });
}

function finished(tx: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    tx.oncomplete = () => {
      resolve();
    };
    tx.onerror = () => {
      reject(tx.error ?? new Error("IndexedDB transaction failed"));
    };
    tx.onabort = () => {
      reject(tx.error ?? new Error("IndexedDB transaction aborted"));
    };
  });
}

/**
 * Stores everything in one IndexedDB object store. Each write is its own transaction, which
 * the browser commits atomically.
 *
 * @param factory - The `indexedDB` object (passed in so tests can supply `fake-indexeddb`).
 * @param name - Database name; one per app profile.
 * @returns The adapter. It opens the database on first use.
 */
export function createIndexedDbStorage(factory: IDBFactory, name = "buckets"): StorageAdapter {
  let opened: Promise<IDBDatabase> | undefined;
  const open = (): Promise<IDBDatabase> => {
    opened ??= new Promise((resolve, reject) => {
      const req = factory.open(name, 1);
      req.onupgradeneeded = () => {
        req.result.createObjectStore(STORE);
      };
      req.onsuccess = () => {
        resolve(req.result);
      };
      req.onerror = () => {
        reject(req.error ?? new Error("Could not open IndexedDB"));
      };
    });
    return opened;
  };
  const store = async (
    mode: IDBTransactionMode,
  ): Promise<{ tx: IDBTransaction; os: IDBObjectStore }> => {
    const tx = (await open()).transaction(STORE, mode);
    return { tx, os: tx.objectStore(STORE) };
  };

  return {
    async read(key) {
      assertValidKey(key);
      const { os } = await store("readonly");
      const value = (await request(os.get(key))) as unknown;
      return value instanceof Uint8Array ? value : undefined;
    },
    async write(key, bytes) {
      assertValidKey(key);
      const { tx, os } = await store("readwrite");
      os.put(bytes.slice(), key);
      await finished(tx);
    },
    async list(prefix) {
      assertValidKey(prefix);
      const { os } = await store("readonly");
      const keys = await request(os.getAllKeys());
      return keys
        .filter((k): k is string => typeof k === "string")
        .filter((k) => k.startsWith(`${prefix}/`) && !k.slice(prefix.length + 1).includes("/"));
    },
    async remove(key) {
      assertValidKey(key);
      const { tx, os } = await store("readwrite");
      os.delete(key);
      await finished(tx);
    },
  };
}

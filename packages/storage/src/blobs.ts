// SPDX-License-Identifier: Apache-2.0

import type { Bucket } from "@buckets/core";
import type { StorageAdapter } from "./adapter";

/**
 * Stores image bytes, named by their SHA-256 hash so the same picture is kept once. In M2 the
 * bytes are plain; M5 encrypts them and the id becomes the hash of the ciphertext, with a
 * migration (plan.md §5).
 */
export interface BlobStore {
  /**
   * Stores bytes.
   *
   * @param bytes - The image.
   * @returns Its id (64 lowercase hex digits).
   */
  put(bytes: Uint8Array): Promise<string>;
  /**
   * Reads bytes.
   *
   * @param id - A blob id.
   * @returns The bytes, or `undefined` when unknown.
   */
  get(id: string): Promise<Uint8Array | undefined>;
  /**
   * Whether bytes are stored.
   *
   * @param id - A blob id.
   * @returns `true` when present.
   */
  has(id: string): Promise<boolean>;
  /**
   * Lists every stored blob id.
   *
   * @returns The ids.
   */
  list(): Promise<string[]>;
}

/**
 * Hashes bytes with SHA-256 using WebCrypto (available in browsers, webviews and Node 22).
 *
 * @param bytes - The data.
 * @returns Lowercase hex digest.
 */
export async function sha256Hex(bytes: Uint8Array): Promise<string> {
  const digest = new Uint8Array(await crypto.subtle.digest("SHA-256", bytes.slice()));
  return Array.from(digest, (b) => b.toString(16).padStart(2, "0")).join("");
}

/**
 * Builds a blob store on a storage adapter, under `blobs/`.
 *
 * @param adapter - Where bytes live.
 * @returns The blob store.
 */
export function createBlobStore(adapter: StorageAdapter): BlobStore {
  const keyOf = (id: string): string => `blobs/${id}`;
  return {
    async put(bytes) {
      const id = await sha256Hex(bytes);
      // Same bytes, same id: nothing to write twice.
      if ((await adapter.read(keyOf(id))) === undefined) await adapter.write(keyOf(id), bytes);
      return id;
    },
    get: (id) => adapter.read(keyOf(id)),
    async has(id) {
      return (await adapter.read(keyOf(id))) !== undefined;
    },
    async list() {
      return (await adapter.list("blobs")).map((key) => key.slice("blobs/".length));
    },
  };
}

/**
 * Finds stored blobs that no item refers to. Garbage collection (30 days after becoming
 * unreferenced) arrives in M4; for now this only reports.
 *
 * @param stored - Every blob id in the store.
 * @param buckets - Every bucket document.
 * @returns The ids nothing refers to.
 */
export function findUnreferencedBlobIds(
  stored: readonly string[],
  buckets: readonly Bucket[],
): string[] {
  const used = new Set<string>();
  for (const bucket of buckets)
    for (const item of Object.values(bucket.items))
      for (const attachment of item.attachments) used.add(attachment.blobId);
  return stored.filter((id) => !used.has(id));
}

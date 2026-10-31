// SPDX-License-Identifier: Apache-2.0

/**
 * Where bytes live. Every platform implements this one small interface (plan.md §8.3), and the
 * rest of the package (documents, blobs, settings) is built on top of it.
 *
 * Keys are `/`-separated paths such as `buckets/<id>` or `blobs/<sha-256>`. A key part uses only
 * letters, digits, `.`, `_` and `-`, so a key is also a safe file path (see {@link isValidKey}).
 * Writes must be atomic: a reader sees the old bytes or the new bytes, never a mixture, even if
 * the app is killed mid-write.
 */
export interface StorageAdapter {
  /**
   * Reads one value.
   *
   * @param key - The key.
   * @returns The bytes, or `undefined` when nothing is stored there.
   */
  read(key: string): Promise<Uint8Array | undefined>;
  /**
   * Stores bytes, replacing any earlier value atomically.
   *
   * @param key - The key.
   * @param bytes - The value.
   */
  write(key: string, bytes: Uint8Array): Promise<void>;
  /**
   * Lists the keys directly under a prefix.
   *
   * @param prefix - A folder-like prefix such as `"buckets"` (no trailing slash).
   * @returns Full keys (`"buckets/abc"`), in no particular order.
   */
  list(prefix: string): Promise<string[]>;
  /**
   * Deletes a value. Deleting a missing key is not an error.
   *
   * @param key - The key.
   */
  remove(key: string): Promise<void>;
}

const KEY_PART = /^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/;

/**
 * Whether a key is safe to use on every platform, including as a file path.
 *
 * @param key - Candidate key, parts joined by `/`.
 * @returns `true` for one to four non-empty parts of letters, digits, `.`, `_` and `-`. No part
 *   starts with a dot, so `..` and hidden files are impossible.
 */
export function isValidKey(key: string): boolean {
  const parts = key.split("/");
  return parts.length >= 1 && parts.length <= 4 && parts.every((part) => KEY_PART.test(part));
}

/**
 * Throws for a key that {@link isValidKey} rejects. A bad key is a programmer error, not
 * something the user can cause.
 *
 * @param key - The key to check.
 */
export function assertValidKey(key: string): void {
  if (!isValidKey(key)) throw new RangeError(`Invalid storage key: ${JSON.stringify(key)}`);
}

// SPDX-License-Identifier: Apache-2.0

import * as Automerge from "@automerge/automerge";
import {
  addBucketRef,
  migrateBucket,
  migrateLibrary,
  removeBucketRef,
  type Bucket,
  type BucketRef,
  type CommandResult,
  type Library,
  type MigrationResult,
  type StoredDocument,
} from "@buckets/core";
import type { StorageAdapter } from "./adapter";

/** Why a stored document was not opened. The file is left exactly as it was. */
export interface LoadProblem {
  /** Storage key of the document. */
  key: string;
  /**
   * `newer-version`: written by a newer Buckets, so this build must not touch it.
   * `unreadable`: damaged or not a Buckets document.
   * `missing`: the library lists the bucket but its file is gone.
   */
  kind: "newer-version" | "unreadable" | "missing";
}

/** Everything the UI shows. A new object is made after every change, so it works with `useSyncExternalStore`. */
export interface LibraryState {
  /** The personal library. */
  library: Library;
  /** Open buckets by id. */
  buckets: Readonly<Record<string, Bucket>>;
  /** Documents that could not be opened. */
  problems: readonly LoadProblem[];
  /** Set while the last save failed; cleared by the next successful save. */
  saveError: string | undefined;
}

/** Reads and changes the user's documents, and saves them in the background. */
export interface LibraryStore {
  /**
   * The current state; the same object until something changes.
   *
   * @returns The state.
   */
  getState(): LibraryState;
  /**
   * Listens for changes.
   *
   * @param listener - Called after every change.
   * @returns A function that stops listening.
   */
  subscribe(listener: () => void): () => void;
  /**
   * Runs a core command on the library inside an Automerge change.
   *
   * @param command - A command, such as `(lib) => reorderBuckets(lib, ids)`.
   * @returns The command's result.
   */
  updateLibrary<T>(command: (library: Library) => CommandResult<T>): CommandResult<T>;
  /**
   * Runs a core command on one bucket inside an Automerge change.
   *
   * @param bucketId - The bucket.
   * @param command - A command, such as `(b) => addItem(b, input, ctx)`.
   * @returns The command's result, or `unknown-bucket`.
   */
  updateBucket<T>(
    bucketId: string,
    command: (bucket: Bucket) => CommandResult<T>,
  ): CommandResult<T>;
  /**
   * Adds a new bucket document and its pointer in the library.
   *
   * @param bucket - The bucket, from `createBucket`.
   * @param ref - Its library pointer.
   */
  addBucket(bucket: Bucket, ref: BucketRef): void;
  /**
   * Removes a bucket from the library and deletes its document.
   *
   * @param bucketId - The bucket.
   * @returns Success, or `unknown-bucket`.
   */
  removeBucket(bucketId: string): Promise<CommandResult<undefined>>;
  /**
   * Saves everything now. Call before the window closes.
   *
   * @returns Resolves when all changes are written (or rejects with the write error).
   */
  flush(): Promise<void>;
}

/** Options for {@link openLibraryStore}. */
export interface OpenOptions {
  /** Makes the first library when none is stored. */
  newLibrary: () => Library;
  /** Wait after a change before saving, in milliseconds. Default 300. */
  saveDelayMs?: number;
}

/** Result of {@link openLibraryStore}. */
export type OpenResult = { ok: true; store: LibraryStore } | { ok: false; problem: LoadProblem };

const LIBRARY_KEY = "library";
const bucketKey = (id: string): string => `buckets/${id}`;

/**
 * Replaces the contents of an Automerge document with a migrated copy.
 */
function applyMigrated<T extends object>(
  doc: Automerge.Doc<T>,
  migrated: StoredDocument,
): Automerge.Doc<T> {
  return Automerge.change(doc, (draft) => {
    const target = draft as Record<string, unknown>;
    for (const key of Object.keys(target))
      if (!(key in migrated)) Reflect.deleteProperty(target, key);
    for (const [key, value] of Object.entries(migrated)) target[key] = value;
  });
}

type Loaded<T extends object> =
  | { ok: true; doc: Automerge.Doc<T>; changed: boolean }
  | { ok: false; kind: "newer-version" | "unreadable" };

function loadDocument<T extends object>(
  bytes: Uint8Array,
  migrate: (input: unknown) => MigrationResult,
): Loaded<T> {
  let doc: Automerge.Doc<T>;
  try {
    doc = Automerge.load<T>(bytes);
  } catch {
    return { ok: false, kind: "unreadable" };
  }
  const result = migrate(Automerge.toJS(doc));
  if (!result.ok)
    return { ok: false, kind: result.reason === "newer-version" ? "newer-version" : "unreadable" };
  if (result.from === result.to) return { ok: true, doc, changed: false };
  return { ok: true, doc: applyMigrated(doc, result.doc), changed: true };
}

/**
 * Opens the user's documents from storage.
 *
 * Loads the library (making a first one if there is none), then every bucket it lists. A
 * bucket that is damaged, missing or written by a newer version is reported in
 * {@link LibraryState.problems} and left untouched on disk. Documents from older versions are
 * migrated in memory and saved.
 *
 * @param adapter - Where bytes live.
 * @param options - How to make a first library, and the save delay.
 * @returns The store, or the problem with the library itself.
 */
export async function openLibraryStore(
  adapter: StorageAdapter,
  options: OpenOptions,
): Promise<OpenResult> {
  const delay = options.saveDelayMs ?? 300;
  const dirty = new Set<string>();

  let libraryDoc: Automerge.Doc<Library>;
  const stored = await adapter.read(LIBRARY_KEY);
  if (stored === undefined) {
    libraryDoc = Automerge.from(
      options.newLibrary() as unknown as Record<string, unknown>,
    ) as unknown as Automerge.Doc<Library>;
    dirty.add(LIBRARY_KEY);
  } else {
    const loaded = loadDocument<Library>(stored, migrateLibrary);
    if (!loaded.ok) return { ok: false, problem: { key: LIBRARY_KEY, kind: loaded.kind } };
    libraryDoc = loaded.doc;
    if (loaded.changed) dirty.add(LIBRARY_KEY);
  }

  const bucketDocs = new Map<string, Automerge.Doc<Bucket>>();
  const problems: LoadProblem[] = [];
  for (const id of Automerge.toJS(libraryDoc).bucketOrder) {
    const key = bucketKey(id);
    const bytes = await adapter.read(key);
    if (bytes === undefined) {
      problems.push({ key, kind: "missing" });
      continue;
    }
    const loaded = loadDocument<Bucket>(bytes, migrateBucket);
    if (!loaded.ok) {
      problems.push({ key, kind: loaded.kind });
      continue;
    }
    bucketDocs.set(id, loaded.doc);
    if (loaded.changed) dirty.add(key);
  }

  // Plain-object views are cached per document version so `getState` stays cheap and stable.
  const views = new WeakMap<object, unknown>();
  const view = <T extends object>(doc: Automerge.Doc<T>): T => {
    let plain = views.get(doc) as T | undefined;
    if (plain === undefined) {
      plain = Automerge.toJS(doc);
      views.set(doc, plain);
    }
    return plain;
  };

  let saveError: string | undefined;
  let state: LibraryState;
  const refresh = (): void => {
    state = {
      library: view(libraryDoc),
      buckets: Object.fromEntries([...bucketDocs].map(([id, doc]) => [id, view(doc)])),
      problems,
      saveError,
    };
  };
  refresh();

  const listeners = new Set<() => void>();
  const notify = (): void => {
    refresh();
    for (const listener of [...listeners]) listener();
  };

  const saveBucket = (id: string): Uint8Array | undefined => {
    const doc = bucketDocs.get(id);
    return doc === undefined ? undefined : Automerge.save(doc);
  };

  let timer: ReturnType<typeof setTimeout> | undefined;
  let writing: Promise<void> = Promise.resolve();
  const save = (): Promise<void> => {
    clearTimeout(timer);
    timer = undefined;
    // One save at a time, in order, so a slow write never overtakes a newer one.
    const run = writing.then(async () => {
      for (const key of [...dirty]) {
        const bytes =
          key === LIBRARY_KEY
            ? Automerge.save(libraryDoc)
            : saveBucket(key.slice("buckets/".length));
        dirty.delete(key);
        if (bytes === undefined) continue;
        try {
          await adapter.write(key, bytes);
        } catch (error) {
          dirty.add(key);
          saveError = error instanceof Error ? error.message : "Could not save";
          notify();
          throw error;
        }
      }
      if (saveError !== undefined) {
        saveError = undefined;
        notify();
      }
    });
    // Callers that don't await still must not leave an unhandled rejection; the error is in state.
    writing = run.catch(() => undefined);
    return run;
  };
  const scheduleSave = (key: string): void => {
    dirty.add(key);
    clearTimeout(timer);
    timer = setTimeout(() => void save(), delay);
  };
  if (dirty.size > 0) await save();

  function change<T extends object, R>(
    doc: Automerge.Doc<T>,
    command: (draft: T) => CommandResult<R>,
  ): { doc: Automerge.Doc<T>; result: CommandResult<R> } {
    let result: CommandResult<R> | undefined;
    const next = Automerge.change(doc, (draft) => {
      result = command(draft);
    });
    // `command` always runs synchronously inside `change`.
    return { doc: next, result: result as unknown as CommandResult<R> };
  }

  const store: LibraryStore = {
    getState: () => state,
    subscribe(listener) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    updateLibrary(command) {
      const { doc, result } = change(libraryDoc, command);
      if (doc !== libraryDoc) {
        libraryDoc = doc;
        scheduleSave(LIBRARY_KEY);
        notify();
      }
      return result;
    },
    updateBucket(bucketId, command) {
      const current = bucketDocs.get(bucketId);
      if (current === undefined) return { ok: false, reason: "unknown-bucket" };
      const { doc, result } = change(current, command);
      if (doc !== current) {
        bucketDocs.set(bucketId, doc);
        scheduleSave(bucketKey(bucketId));
        notify();
      }
      return result;
    },
    addBucket(bucket, ref) {
      // Bucket first, then the pointer, so a crash never leaves a pointer to nothing.
      bucketDocs.set(
        bucket.id,
        Automerge.from(
          bucket as unknown as Record<string, unknown>,
        ) as unknown as Automerge.Doc<Bucket>,
      );
      dirty.add(bucketKey(bucket.id));
      libraryDoc = Automerge.change(libraryDoc, (draft) => {
        addBucketRef(draft, ref);
      });
      scheduleSave(LIBRARY_KEY);
      notify();
    },
    async removeBucket(bucketId) {
      const removed = change(libraryDoc, (draft) => removeBucketRef(draft, bucketId));
      if (!removed.result.ok) return { ok: false, reason: removed.result.reason };
      libraryDoc = removed.doc;
      bucketDocs.delete(bucketId);
      dirty.delete(bucketKey(bucketId));
      notify();
      // Pointer first, file second: a crash leaves an orphan file, never a pointer to nothing.
      dirty.add(LIBRARY_KEY);
      await save();
      await adapter.remove(bucketKey(bucketId));
      return { ok: true, value: undefined };
    },
    flush: save,
  };
  return { ok: true, store };
}

// SPDX-License-Identifier: Apache-2.0

/** A plain JSON object, as stored. */
export type StoredDocument = Record<string, unknown>;

/** Rewrites a document from one schema version to the next. */
export type MigrationStep = (doc: StoredDocument) => StoredDocument;

/** Result of migrating a stored document. */
export type MigrationResult =
  | { ok: true; doc: StoredDocument; from: number; to: number }
  | { ok: false; reason: "invalid-document" }
  | { ok: false; reason: "newer-version"; found: number; supported: number }
  | { ok: false; reason: "missing-step"; version: number }
  | { ok: false; reason: "step-failed"; version: number };

/** Describes the versions of one kind of document. */
export interface MigratorConfig {
  /** Version this build reads and writes. */
  current: number;
  /** Steps keyed by the version they upgrade *from* (so `1` turns version 1 into version 2). */
  steps: Readonly<Record<number, MigrationStep>>;
}

/**
 * Builds a function that upgrades stored documents to the current schema version.
 *
 * Rules (AGENTS.md rule 10): every schema change bumps `current` and adds a step with tests. A
 * document from a newer build is refused, never guessed at, so an old app cannot damage data it
 * does not understand. Steps must not mutate their input; a throwing step is reported, not raised.
 *
 * @param config - Current version and upgrade steps.
 * @returns A migrator.
 */
export function createMigrator(config: MigratorConfig): (input: unknown) => MigrationResult {
  return (input) => {
    if (typeof input !== "object" || input === null || Array.isArray(input))
      return { ok: false, reason: "invalid-document" };
    const version = (input as StoredDocument)["schemaVersion"];
    if (typeof version !== "number" || !Number.isInteger(version) || version < 1)
      return { ok: false, reason: "invalid-document" };
    if (version > config.current)
      return { ok: false, reason: "newer-version", found: version, supported: config.current };

    let doc = input as StoredDocument;
    for (let v = version; v < config.current; v++) {
      const step = config.steps[v];
      if (!step) return { ok: false, reason: "missing-step", version: v };
      try {
        doc = { ...step(doc), schemaVersion: v + 1 };
      } catch {
        return { ok: false, reason: "step-failed", version: v };
      }
    }
    return { ok: true, doc, from: version, to: config.current };
  };
}

/** Current bucket format version; bump together with a step in {@link migrateBucket}. */
export const BUCKET_SCHEMA_VERSION = 1;

/** Current library format version; bump together with a step in {@link migrateLibrary}. */
export const LIBRARY_SCHEMA_VERSION = 1;

/** Upgrades a stored bucket document to the current version. Version 1 is the first release, so no steps yet. */
export const migrateBucket = createMigrator({ current: BUCKET_SCHEMA_VERSION, steps: {} });

/** Upgrades a stored library document to the current version. Version 1 is the first release, so no steps yet. */
export const migrateLibrary = createMigrator({ current: LIBRARY_SCHEMA_VERSION, steps: {} });

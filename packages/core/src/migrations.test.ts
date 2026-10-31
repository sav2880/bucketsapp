// SPDX-License-Identifier: Apache-2.0

import { describe, expect, it } from "vitest";
import { createLibrary } from "./model/commands";
import {
  BUCKET_SCHEMA_VERSION,
  LIBRARY_SCHEMA_VERSION,
  createMigrator,
  migrateBucket,
  migrateLibrary,
} from "./migrations";
import { createBucket } from "./model/commands";

const ctx = { memberId: "me", now: new Date("2026-10-30T09:00:00Z"), makeId: () => "id" };

describe("createMigrator", () => {
  // A pretend history: v1 had `title`; v2 renamed it to `name`; v3 added `tags`.
  const migrate = createMigrator({
    current: 3,
    steps: {
      1: ({ title, ...rest }) => ({ ...rest, name: title }),
      2: (doc) => ({ ...doc, tags: [] }),
    },
  });

  it("walks a document through every step to the current version", () => {
    expect(migrate({ schemaVersion: 1, title: "Games" })).toEqual({
      ok: true,
      doc: { schemaVersion: 3, name: "Games", tags: [] },
      from: 1,
      to: 3,
    });
    expect(migrate({ schemaVersion: 2, name: "Games" })).toMatchObject({
      ok: true,
      from: 2,
      doc: { schemaVersion: 3, tags: [] },
    });
  });

  it("returns a current document unchanged", () => {
    const doc = { schemaVersion: 3, name: "Games", tags: ["a"] };
    expect(migrate(doc)).toEqual({ ok: true, doc, from: 3, to: 3 });
  });

  it("does not modify its input", () => {
    const input = { schemaVersion: 1, title: "Games" };
    migrate(input);
    expect(input).toEqual({ schemaVersion: 1, title: "Games" });
  });

  it("refuses documents from a newer build instead of guessing", () => {
    expect(migrate({ schemaVersion: 4 })).toEqual({
      ok: false,
      reason: "newer-version",
      found: 4,
      supported: 3,
    });
  });

  it.each([
    null,
    undefined,
    "text",
    5,
    [],
    {},
    { schemaVersion: "1" },
    { schemaVersion: 0 },
    { schemaVersion: 1.5 },
  ])("refuses %j as invalid", (input) => {
    expect(migrate(input)).toEqual({ ok: false, reason: "invalid-document" });
  });

  it("reports a gap in the steps", () => {
    expect(createMigrator({ current: 3, steps: { 2: (d) => d } })({ schemaVersion: 1 })).toEqual({
      ok: false,
      reason: "missing-step",
      version: 1,
    });
  });

  it("reports a step that throws, naming the version it was upgrading", () => {
    const broken = createMigrator({
      current: 2,
      steps: {
        1: () => {
          throw new Error("boom");
        },
      },
    });
    expect(broken({ schemaVersion: 1 })).toEqual({ ok: false, reason: "step-failed", version: 1 });
  });
});

describe("current documents", () => {
  it("accepts a freshly created bucket and library", () => {
    const bucket = createBucket({ name: "A", ownerName: "Me" }, ctx);
    const library = createLibrary("Me", ctx);
    expect(bucket.schemaVersion).toBe(BUCKET_SCHEMA_VERSION);
    expect(library.schemaVersion).toBe(LIBRARY_SCHEMA_VERSION);
    expect(migrateBucket(bucket)).toMatchObject({ ok: true, from: 1, to: 1 });
    expect(migrateLibrary(library)).toMatchObject({ ok: true, from: 1, to: 1 });
  });

  it("refuses a bucket from a future build", () => {
    expect(migrateBucket({ schemaVersion: BUCKET_SCHEMA_VERSION + 1 })).toMatchObject({
      ok: false,
      reason: "newer-version",
    });
  });
});

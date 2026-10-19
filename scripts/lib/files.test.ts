// SPDX-License-Identifier: Apache-2.0

import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { isEntryPoint, listFiles, listRootFiles } from "./files";

let root = "";

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), "buckets-files-"));
});

afterEach(() => {
  rmSync(root, { recursive: true, force: true });
});

describe("files", () => {
  it("lists files recursively and skips dependency and build folders", () => {
    mkdirSync(join(root, "packages/a/src"), { recursive: true });
    mkdirSync(join(root, "packages/a/node_modules/x"), { recursive: true });
    writeFileSync(join(root, "packages/a/src/i.ts"), "");
    writeFileSync(join(root, "packages/a/node_modules/x/i.ts"), "");
    expect(listFiles(root, "packages")).toEqual(["packages/a/src/i.ts"]);
  });

  it("lists only root-level files", () => {
    mkdirSync(join(root, "dir"));
    writeFileSync(join(root, "a.js"), "");
    writeFileSync(join(root, "dir/b.js"), "");
    expect(listRootFiles(root)).toEqual(["a.js"]);
  });

  it("is not the entry point when imported by a test", () => {
    expect(isEntryPoint(import.meta.url)).toBe(false);
  });
});

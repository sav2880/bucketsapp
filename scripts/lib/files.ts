// SPDX-License-Identifier: Apache-2.0

import { readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { pathToFileURL } from "node:url";

/** Directory names that never contain our own source. */
const SKIPPED_DIRS = new Set(["node_modules", "dist", "coverage", "target", ".git", "prototype"]);

/**
 * Lists files under `dir` (recursively), skipping dependency and build output.
 * @param root - Repository root; returned paths are relative to it.
 * @param dir - Directory to walk, relative to `root`.
 * @returns Repo-relative paths using `/` separators.
 */
export function listFiles(root: string, dir: string): string[] {
  const absolute = join(root, dir);
  const results: string[] = [];
  for (const name of readdirSync(absolute)) {
    if (SKIPPED_DIRS.has(name)) continue;
    const full = join(absolute, name);
    if (statSync(full).isDirectory()) {
      results.push(...listFiles(root, relative(root, full)));
    } else {
      results.push(relative(root, full).split("\\").join("/"));
    }
  }
  return results;
}

/**
 * Lists the files that sit directly in the repository root.
 * @param root - Repository root.
 * @returns Root-level file names.
 */
export function listRootFiles(root: string): string[] {
  return readdirSync(root).filter((name) => statSync(join(root, name)).isFile());
}

/**
 * True when this module is the script being run, not imported by a test.
 * @param metaUrl - The caller's `import.meta.url`.
 * @returns Whether the caller is the entry point.
 */
export function isEntryPoint(metaUrl: string): boolean {
  const entry = process.argv[1];
  return entry !== undefined && metaUrl === pathToFileURL(entry).href;
}

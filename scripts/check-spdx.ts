// SPDX-License-Identifier: Apache-2.0

import { existsSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { isEntryPoint, listFiles, listRootFiles } from "./lib/files";

const SOURCE_EXTENSIONS = /\.(ts|tsx|js|mjs|cjs|rs)$/;
const CLIENT_DIRS = ["apps", "packages", "scripts", "e2e"];

/**
 * The license a source file must declare, by location (AGENTS.md rule 9).
 * @param path - Repo-relative path.
 * @returns The expected SPDX identifier.
 */
export function expectedLicense(path: string): "Apache-2.0" | "AGPL-3.0-only" {
  return path.startsWith("server/") ? "AGPL-3.0-only" : "Apache-2.0";
}

/**
 * Checks the SPDX header of one file.
 * @param path - Repo-relative path, used to pick the expected license.
 * @param content - The file's text.
 * @returns A problem description, or `null` when the header is correct.
 */
export function checkHeader(path: string, content: string): string | null {
  const head = content.split("\n").slice(0, 3).join("\n");
  const match = /SPDX-License-Identifier:\s*([A-Za-z0-9.+-]+)/.exec(head);
  const expected = expectedLicense(path);
  if (!match) return `${path}: missing "SPDX-License-Identifier: ${expected}" header`;
  if (match[1] !== expected) return `${path}: has ${match[1] ?? "?"}, expected ${expected}`;
  return null;
}

/**
 * Checks every source file in the repository.
 * @param root - Repository root.
 * @returns All problems found.
 */
export function checkRepo(root: string): string[] {
  const dirs = [...CLIENT_DIRS, "server"].filter((dir) => existsSync(resolve(root, dir)));
  const files = [...listRootFiles(root), ...dirs.flatMap((dir) => listFiles(root, dir))];
  return files
    .filter((path) => SOURCE_EXTENSIONS.test(path))
    .map((path) => checkHeader(path, readFileSync(resolve(root, path), "utf8")))
    .filter((problem): problem is string => problem !== null);
}

if (isEntryPoint(import.meta.url)) {
  const problems = checkRepo(resolve(dirname(fileURLToPath(import.meta.url)), ".."));
  if (problems.length > 0) {
    console.error(problems.join("\n"));
    console.error(`\n${String(problems.length)} file(s) have a missing or wrong SPDX header.`);
    process.exit(1);
  }
  console.log("SPDX headers OK");
}

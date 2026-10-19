// SPDX-License-Identifier: Apache-2.0

import { execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { isEntryPoint, listFiles } from "./lib/files";

/**
 * Licenses accepted for client dependencies (plan.md §14: permissive only).
 * Python-2.0 and CC-BY-* appear only in dev tooling (argparse, caniuse-lite,
 * spdx-exceptions); they are attribution-only and do not restrict our code.
 */
export const ALLOWED_LICENSES: ReadonlySet<string> = new Set([
  "MIT",
  "BSD-2-Clause",
  "BSD-3-Clause",
  "ISC",
  "Apache-2.0",
  "MPL-2.0",
  "Zlib",
  "0BSD",
  "BlueOak-1.0.0",
  "CC0-1.0",
  "Unlicense",
  "Python-2.0",
  "CC-BY-3.0",
  "CC-BY-4.0",
]);

/** Shape of `pnpm licenses list --json`: license id → packages. */
export type LicenseReport = Record<string, { name: string; versions: string[] }[]>;

/**
 * Lists dependencies whose license is not on the allowlist.
 * @param report - Parsed output of `pnpm licenses list --json`.
 * @returns One message per offending package.
 */
export function findDisallowed(report: LicenseReport): string[] {
  return Object.entries(report)
    .filter(([license]) => !ALLOWED_LICENSES.has(license))
    .flatMap(([license, packages]) =>
      packages.map((pkg) => `${pkg.name}@${pkg.versions.join(",")}: ${license}`),
    );
}

/**
 * Finds imports in client code that reach into `server/`.
 * @param path - Repo-relative path of the importing file.
 * @param source - The file's text.
 * @returns One message per offending import.
 */
export function findServerImports(path: string, source: string): string[] {
  const specifier = /(?:from|import|require\()\s*["']([^"']+)["']/g;
  const problems: string[] = [];
  for (const match of source.matchAll(specifier)) {
    const target = match[1] ?? "";
    if (!target.startsWith(".")) continue;
    const resolved = resolve("/repo", dirname(path), target);
    if (resolved.startsWith("/repo/server/") || resolved === "/repo/server") {
      problems.push(`${path}: imports from server/ via "${target}"`);
    }
  }
  return problems;
}

if (isEntryPoint(import.meta.url)) {
  const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
  const output = execFileSync("pnpm", ["licenses", "list", "--json"], {
    cwd: root,
    encoding: "utf8",
    maxBuffer: 64 * 1024 * 1024,
  });
  const problems = findDisallowed(JSON.parse(output) as LicenseReport);
  for (const dir of ["apps", "packages"].filter((d) => existsSync(resolve(root, d)))) {
    for (const path of listFiles(root, dir).filter((p) => /\.(tsx?|js|mjs)$/.test(p))) {
      problems.push(...findServerImports(path, readFileSync(resolve(root, path), "utf8")));
    }
  }
  if (problems.length > 0) {
    console.error(problems.join("\n"));
    process.exit(1);
  }
  console.log("Licenses OK");
}

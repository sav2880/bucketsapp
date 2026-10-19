// SPDX-License-Identifier: Apache-2.0

import { existsSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import ts from "typescript";
import { isEntryPoint, listFiles } from "./lib/files";

const SCAN_DIRS = ["apps", "packages", "e2e"];
const BANNED_PHRASE = /\b(to-?dos?|task[\s_-]?lists?|sub-?tasks?|check-?lists?)\b/i;

/**
 * Finds banned words in free text (locale files, HTML, string literals).
 * @param text - Text to scan.
 * @returns The first banned word found, or `null`.
 */
export function findBannedPhrase(text: string): string | null {
  return BANNED_PHRASE.exec(text)?.[0] ?? null;
}

/**
 * Finds banned words in a code identifier such as `todoItems` or `SubtaskRow`.
 * @param identifier - The identifier text.
 * @returns The banned word, or `null`.
 */
export function findBannedIdentifier(identifier: string): string | null {
  const words = identifier
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .replace(/[_$-]+/g, " ")
    .toLowerCase()
    .split(" ");
  const single = words.find((word) => /^(todos?|subtasks?|checklists?|tasklists?)$/.test(word));
  if (single) return single;
  const at = words.findIndex(
    (word, i) => /^tasks?$/.test(word) && /^lists?$/.test(words[i + 1] ?? ""),
  );
  return at >= 0 ? "task list" : null;
}

/**
 * Scans TypeScript/TSX source: string literals, JSX text and identifiers only,
 * so comments and docs may still name the banned words.
 * @param path - File name, used to pick the TSX or TS parser.
 * @param source - File text.
 * @returns One message per problem.
 */
export function checkSource(path: string, source: string): string[] {
  const kind = path.endsWith("x") ? ts.ScriptKind.TSX : ts.ScriptKind.TS;
  const file = ts.createSourceFile(path, source, ts.ScriptTarget.Latest, true, kind);
  const problems: string[] = [];
  const report = (node: ts.Node, word: string): void => {
    const { line } = file.getLineAndCharacterOfPosition(node.getStart(file));
    problems.push(`${path}:${String(line + 1)}: "${word}" (say bucket / item instead)`);
  };
  const visit = (node: ts.Node): void => {
    if (
      ts.isStringLiteral(node) ||
      ts.isNoSubstitutionTemplateLiteral(node) ||
      ts.isTemplateHead(node) ||
      ts.isTemplateMiddle(node) ||
      ts.isTemplateTail(node) ||
      ts.isJsxText(node)
    ) {
      const word = findBannedPhrase(node.text);
      if (word) report(node, word);
    } else if (ts.isIdentifier(node)) {
      const word = findBannedIdentifier(node.text);
      if (word) report(node, word);
    }
    ts.forEachChild(node, visit);
  };
  visit(file);
  return problems;
}

/**
 * Scans a whole text file (locale JSON, HTML).
 * @param path - Repo-relative path.
 * @param text - File text.
 * @returns One message per offending line.
 */
export function checkText(path: string, text: string): string[] {
  return text.split("\n").flatMap((line, i) => {
    const word = findBannedPhrase(line);
    return word ? [`${path}:${String(i + 1)}: "${word}" (say bucket / item instead)`] : [];
  });
}

/**
 * Scans the repository's user-facing sources.
 * @param root - Repository root.
 * @returns All problems found.
 */
export function checkRepo(root: string): string[] {
  const files = SCAN_DIRS.filter((dir) => existsSync(resolve(root, dir))).flatMap((dir) =>
    listFiles(root, dir),
  );
  return files.flatMap((path) => {
    const read = (): string => readFileSync(resolve(root, path), "utf8");
    if (/\.tsx?$/.test(path)) return checkSource(path, read());
    if (/\.(json|html)$/.test(path) && !path.endsWith("package.json") && !/tsconfig/.test(path)) {
      return checkText(path, read());
    }
    return [];
  });
}

if (isEntryPoint(import.meta.url)) {
  const problems = checkRepo(resolve(dirname(fileURLToPath(import.meta.url)), ".."));
  if (problems.length > 0) {
    console.error(problems.join("\n"));
    process.exit(1);
  }
  console.log("Terminology OK");
}

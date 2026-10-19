// SPDX-License-Identifier: Apache-2.0

import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  checkRepo,
  checkSource,
  checkText,
  findBannedIdentifier,
  findBannedPhrase,
} from "./check-terminology";

describe("check-terminology", () => {
  it.each(["to-do", "To-Do list", "todo", "my todos", "task list", "Subtask", "checklists"])(
    "flags %s in text",
    (text) => {
      expect(findBannedPhrase(text)).not.toBeNull();
    },
  );

  it.each(["bucket", "item", "steps", "Mastodon", "tasks done", "to do something"])(
    "allows %s in text",
    (text) => {
      expect(findBannedPhrase(text)).toBeNull();
    },
  );

  it("flags banned words inside identifiers", () => {
    expect(findBannedIdentifier("todoItems")).toBe("todo");
    expect(findBannedIdentifier("SubtaskRow")).toBe("subtask");
    expect(findBannedIdentifier("task_list")).toBe("task list");
    expect(findBannedIdentifier("taskListView")).toBe("task list");
  });

  it("allows the real vocabulary in identifiers", () => {
    expect(findBannedIdentifier("tossBack")).toBeNull();
    expect(findBannedIdentifier("inHand")).toBeNull();
    expect(findBannedIdentifier("taskRunner")).toBeNull();
  });

  it("checks string literals and JSX text but not comments", () => {
    const source = [
      "// TODO: a comment may say todo",
      'export const label = "Add to-do";',
      "export const view = <p>Your checklist</p>;",
    ].join("\n");
    const problems = checkSource("a.tsx", source);
    expect(problems).toHaveLength(2);
    expect(problems[0]).toContain("a.tsx:2");
    expect(problems[1]).toContain("a.tsx:3");
  });

  it("reports the line number for text files", () => {
    expect(checkText("en.json", '{\n  "a": "Open your todo"\n}')).toEqual([
      'en.json:2: "todo" (say bucket / item instead)',
    ]);
  });
});

describe("check-terminology on a repository", () => {
  it("scans locale files and sources, and ignores Markdown and manifests", () => {
    const root = mkdtempSync(join(tmpdir(), "buckets-terms-"));
    try {
      mkdirSync(join(root, "packages/ui/src/locales"), { recursive: true });
      writeFileSync(join(root, "packages/ui/src/locales/en.json"), '{ "a": "Your todo list" }\n');
      writeFileSync(join(root, "packages/ui/src/ok.ts"), 'export const a = "bucket";\n');
      writeFileSync(join(root, "packages/ui/src/bad.ts"), 'export const a = "checklist";\n');
      writeFileSync(join(root, "packages/ui/README.md"), "a checklist is fine in docs\n");
      writeFileSync(join(root, "packages/ui/package.json"), '{ "description": "todo" }\n');
      expect(checkRepo(root).sort()).toEqual([
        'packages/ui/src/bad.ts:1: "checklist" (say bucket / item instead)',
        'packages/ui/src/locales/en.json:1: "todo" (say bucket / item instead)',
      ]);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
});

// SPDX-License-Identifier: Apache-2.0

import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { checkHeader, checkRepo, expectedLicense } from "./check-spdx";

describe("check-spdx", () => {
  it("expects Apache-2.0 outside server/ and AGPL-3.0-only inside it", () => {
    expect(expectedLicense("packages/core/src/index.ts")).toBe("Apache-2.0");
    expect(expectedLicense("server/src/main.ts")).toBe("AGPL-3.0-only");
  });

  it("accepts a correct header", () => {
    expect(checkHeader("apps/web/src/a.ts", "// SPDX-License-Identifier: Apache-2.0\n")).toBeNull();
    expect(checkHeader("server/a.ts", "// SPDX-License-Identifier: AGPL-3.0-only\n")).toBeNull();
  });

  it("accepts a block-comment header", () => {
    expect(checkHeader("a.js", "/* SPDX-License-Identifier: Apache-2.0 */\n")).toBeNull();
  });

  it("rejects a missing header", () => {
    expect(checkHeader("packages/core/src/a.ts", "export const a = 1;\n")).toMatch(/missing/);
  });

  it("rejects a header that is too far down the file", () => {
    const late = "\n\n\n// SPDX-License-Identifier: Apache-2.0\n";
    expect(checkHeader("packages/core/src/a.ts", late)).toMatch(/missing/);
  });

  it("rejects the wrong license for the location", () => {
    expect(checkHeader("server/a.ts", "// SPDX-License-Identifier: Apache-2.0\n")).toMatch(
      /expected AGPL-3.0-only/,
    );
    expect(checkHeader("packages/a.ts", "// SPDX-License-Identifier: AGPL-3.0-only\n")).toMatch(
      /expected Apache-2.0/,
    );
  });
});

describe("check-spdx on a repository", () => {
  it("finds files without headers across client dirs, server/ and the root", () => {
    const root = mkdtempSync(join(tmpdir(), "buckets-spdx-"));
    try {
      mkdirSync(join(root, "packages/a"), { recursive: true });
      mkdirSync(join(root, "server"));
      writeFileSync(join(root, "packages/a/ok.ts"), "// SPDX-License-Identifier: Apache-2.0\n");
      writeFileSync(join(root, "packages/a/bad.ts"), "export {};\n");
      writeFileSync(join(root, "packages/a/notes.md"), "no header needed\n");
      writeFileSync(join(root, "server/wrong.ts"), "// SPDX-License-Identifier: Apache-2.0\n");
      writeFileSync(join(root, "root.config.js"), "export {};\n");
      expect(checkRepo(root).sort()).toEqual([
        'packages/a/bad.ts: missing "SPDX-License-Identifier: Apache-2.0" header',
        'root.config.js: missing "SPDX-License-Identifier: Apache-2.0" header',
        "server/wrong.ts: has Apache-2.0, expected AGPL-3.0-only",
      ]);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
});

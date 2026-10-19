// SPDX-License-Identifier: Apache-2.0

import { describe, expect, it } from "vitest";
import { findDisallowed, findServerImports } from "./check-licenses";

describe("check-licenses", () => {
  it("accepts permissive licenses", () => {
    expect(findDisallowed({ MIT: [{ name: "a", versions: ["1.0.0"] }] })).toEqual([]);
  });

  it("rejects copyleft and unknown licenses, naming the package", () => {
    const report = {
      "GPL-3.0": [{ name: "bad", versions: ["2.0.0"] }],
      "SEE LICENSE IN FILE": [{ name: "odd", versions: ["1.0.0", "1.1.0"] }],
    };
    expect(findDisallowed(report)).toEqual([
      "bad@2.0.0: GPL-3.0",
      "odd@1.0.0,1.1.0: SEE LICENSE IN FILE",
    ]);
  });

  it("flags relative imports that reach into server/", () => {
    const source = 'import { x } from "../../../server/src/db";\nexport { y } from "./y";';
    expect(findServerImports("packages/sync/src/a.ts", source)).toEqual([
      'packages/sync/src/a.ts: imports from server/ via "../../../server/src/db"',
    ]);
  });

  it("ignores package imports and imports that stay inside the package", () => {
    const source = 'import a from "server-utils";\nimport b from "./server/x";';
    expect(findServerImports("packages/sync/src/a.ts", source)).toEqual([]);
  });
});

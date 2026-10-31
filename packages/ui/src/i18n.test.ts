// SPDX-License-Identifier: Apache-2.0

import { describe, expect, it } from "vitest";
import { t, tp } from "./i18n";

describe("t", () => {
  it("returns plain text and fills placeholders", () => {
    expect(t("app.name")).toBe("Buckets");
    expect(t("columns.resize", { name: "Status" })).toBe("Resize column Status");
  });

  it("leaves a placeholder with no value as written", () => {
    expect(t("columns.resize", {})).toBe("Resize column {name}");
    expect(t("columns.resize")).toBe("Resize column {name}");
  });
});

describe("tp", () => {
  it("picks the plural form and fills in the count", () => {
    expect(tp("count.items", 0)).toBe("0 items");
    expect(tp("count.items", 1)).toBe("1 item");
    expect(tp("count.items", 2)).toBe("2 items");
  });
});

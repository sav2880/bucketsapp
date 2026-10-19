// SPDX-License-Identifier: Apache-2.0

import { describe, expect, it } from "vitest";
import { PACKAGE_NAME } from "./index";

describe("@buckets/core", () => {
  it("exposes its package name", () => {
    expect(PACKAGE_NAME).toBe("@buckets/core");
  });
});

// SPDX-License-Identifier: Apache-2.0

import { describe, expect, it } from "vitest";
import { strings } from "./strings";

describe("strings", () => {
  it("names the app", () => {
    expect(strings["app.name"]).toBe("Buckets");
  });
});

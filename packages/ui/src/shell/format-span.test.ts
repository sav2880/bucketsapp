// SPDX-License-Identifier: Apache-2.0

import { describe, expect, it } from "vitest";
import { formatSpan } from "./format-span";

const MIN = 60_000;
const HOUR = 60 * MIN;
const DAY = 24 * HOUR;

describe("formatSpan", () => {
  it("says minutes, never zero", () => {
    expect(formatSpan(0)).toBe("1 min");
    expect(formatSpan(20_000)).toBe("1 min");
    expect(formatSpan(5 * MIN)).toBe("5 min");
    expect(formatSpan(59 * MIN)).toBe("59 min");
  });

  it("says hours below a day", () => {
    expect(formatSpan(HOUR)).toBe("1 h");
    expect(formatSpan(5 * HOUR + 20 * MIN)).toBe("5 h");
  });

  it("says days from a day on, in the right plural", () => {
    expect(formatSpan(DAY)).toBe("1 day");
    expect(formatSpan(3 * DAY)).toBe("3 days");
  });

  it("ignores the sign", () => {
    expect(formatSpan(-2 * HOUR)).toBe("2 h");
  });
});

// SPDX-License-Identifier: Apache-2.0

import { describe, expect, it } from "vitest";
import { duration, durationToMs, parseDuration } from "./duration";

describe("Duration", () => {
  it("converts each unit to milliseconds", () => {
    expect(durationToMs(duration(2, "minutes"))).toBe(120_000);
    expect(durationToMs(duration(24, "hours"))).toBe(86_400_000);
    expect(durationToMs(duration(30, "days"))).toBe(2_592_000_000);
  });

  it("accepts valid stored values", () => {
    expect(parseDuration({ unit: "hours", value: 3 })).toEqual({ unit: "hours", value: 3 });
    expect(parseDuration({ unit: "days", value: 0 })).toEqual({ unit: "days", value: 0 });
  });

  it.each([
    null,
    "PT24H",
    42,
    {},
    { unit: "months", value: 1 },
    { unit: "toString", value: 1 },
    { unit: "hours", value: -1 },
    { unit: "hours", value: Number.NaN },
    { unit: "hours", value: Number.POSITIVE_INFINITY },
    { unit: "hours", value: "3" },
  ])("rejects malformed value %j", (input) => {
    expect(parseDuration(input)).toBeUndefined();
  });
});

// SPDX-License-Identifier: Apache-2.0

import { describe, expect, it } from "vitest";
import { duration } from "../duration";
import { BASE_RULES, PRESETS, matchPreset, rulesEqual } from "./presets";
import type { BucketPresetId } from "./types";

describe("presets", () => {
  it("every preset except nested matches itself, and nested is never reported", () => {
    for (const [id, preset] of Object.entries(PRESETS)) {
      expect(matchPreset(preset.rules)).toBe(id === "nested" ? "custom" : id);
    }
  });

  it("edited rules become custom", () => {
    expect(matchPreset({ ...PRESETS["grab-and-go"].rules, maxInHand: 4 })).toBe("custom");
  });

  it("notices a changed duration", () => {
    const rules = PRESETS["rotation-pool"].rules;
    expect(matchPreset({ ...rules, cycleResetAfter: duration(31, "days") })).toBe("custom");
    expect(matchPreset({ ...rules, cycleResetAfter: duration(30, "days") })).toBe("rotation-pool");
    const without = { ...rules };
    delete without.cycleResetAfter;
    expect(matchPreset(without)).toBe("custom");
  });

  it("compares optional durations that are absent on both sides", () => {
    expect(rulesEqual(BASE_RULES, { ...BASE_RULES })).toBe(true);
    expect(rulesEqual(BASE_RULES, { ...BASE_RULES, cooldown: duration(1, "hours") })).toBe(false);
  });

  it("gives every preset a name and a summary", () => {
    const ids: BucketPresetId[] = Object.keys(PRESETS) as BucketPresetId[];
    expect(ids).toHaveLength(8);
    for (const preset of Object.values(PRESETS)) {
      expect(preset.name).not.toBe("");
      expect(preset.summary).not.toBe("");
    }
  });

  it("freezes the shared rules so no caller can alter them", () => {
    expect(Object.isFrozen(BASE_RULES)).toBe(true);
    expect(Object.isFrozen(PRESETS["simmer"].rules)).toBe(true);
  });
});

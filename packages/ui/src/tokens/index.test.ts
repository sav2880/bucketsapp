// SPDX-License-Identifier: Apache-2.0

import { describe, expect, it } from "vitest";
import { cssVariableName, cssVariables, darkColors, lightColors } from "./index";

describe("design tokens", () => {
  it("defines the same color tokens in light and dark", () => {
    expect(Object.keys(darkColors).sort()).toEqual(Object.keys(lightColors).sort());
  });

  it("maps token names to the prototype's CSS custom properties", () => {
    expect(cssVariableName("bg")).toBe("--bg");
    expect(cssVariableName("text2")).toBe("--text-2");
    expect(cssVariableName("paperInk2")).toBe("--paper-ink-2");
    expect(cssVariableName("onEnamel")).toBe("--on-enamel");
  });

  it("builds theme-specific custom properties", () => {
    expect(cssVariables("light")["--bg"]).toBe("#ffffff");
    expect(cssVariables("dark")["--bg"]).toBe("#1c1c1e");
  });

  it("includes radii, spacing, easing and the font stack", () => {
    const variables = cssVariables("light");
    expect(variables["--r-m"]).toBe("10px");
    expect(variables["--space-2"]).toBe("8px");
    expect(variables["--ease-out"]).toContain("cubic-bezier");
    expect(variables["--font"]).toContain("system-ui");
  });

  it("only uses colors that are valid hex or rgba values", () => {
    for (const value of [...Object.values(lightColors), ...Object.values(darkColors)]) {
      expect(value).toMatch(/^(#[0-9a-f]{6}|rgba\(\d+, \d+, \d+, [\d.]+\))$/);
    }
  });
});

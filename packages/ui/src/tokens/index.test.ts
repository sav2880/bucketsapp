// SPDX-License-Identifier: Apache-2.0

import { describe, expect, it } from "vitest";
import { BUCKET_COLORS } from "@buckets/core";
import {
  bucketColorVariables,
  bucketPaint,
  cssVariableName,
  cssVariables,
  darkColors,
  lightColors,
} from "./index";

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

describe("bucket colors", () => {
  it("paints every color name core allows", () => {
    for (const name of BUCKET_COLORS)
      expect(bucketPaint(name, "light").enamel).toMatch(/^#[0-9a-f]{6}$/);
  });

  it("darkens the text color in light mode only", () => {
    expect(bucketPaint("blue", "light")).toEqual({
      enamel: "#3b82d6",
      enamelText: "#2a6cbd",
      onEnamel: "#ffffff",
    });
    expect(bucketPaint("blue", "dark").enamelText).toBe("#3b82d6");
    expect(bucketPaint("yellow", "dark").onEnamel).toBe("#2c2100");
  });

  it("falls back to the default for a name from a newer version", () => {
    expect(bucketPaint("chartreuse", "light")).toEqual(bucketPaint("accent", "light"));
  });

  it("sets the custom properties the bucket art reads", () => {
    expect(bucketColorVariables("teal", "dark")).toEqual({
      "--enamel": "#1f9ba0",
      "--enamel-text": "#1f9ba0",
      "--on-enamel": "#ffffff",
    });
  });

  it("adds shadow, focus ring and toolbar height to the theme variables", () => {
    expect(cssVariables("dark")["--shadow-card"]).toContain("0.45");
    expect(cssVariables("light")["--focus-ring"]).toContain("var(--accent)");
    expect(cssVariables("light")["--toolbar-h"]).toBe("58px");
  });
});

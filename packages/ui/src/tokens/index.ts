// SPDX-License-Identifier: Apache-2.0

/**
 * Design tokens (AGENTS.md §7). Components use these, never raw hex or pixel values.
 *
 * Colors, radii, the easing curve and the font stack come from the clickable prototype
 * (`docs/prototype/styles.css`), so M2 starts from what was already tried. The spacing scale
 * is new: the prototype had no spacing tokens.
 */

/** A set of color values for one theme. */
export type ColorTokens = {
  /** Window and main-pane background. */
  bg: string;
  /** Sidebar material fallback (solid where vibrancy or Mica isn't available). */
  sidebarBg: string;
  /** Secondary pane background. */
  paneBg: string;
  /** Primary text. */
  text: string;
  /** Secondary text. */
  text2: string;
  /** Tertiary text and placeholders. */
  text3: string;
  /** Hairline separators. */
  sep: string;
  /** Subtle control fill. */
  fill: string;
  /** Stronger control fill (pressed, selected). */
  fillStrong: string;
  /** System-style accent. */
  accent: string;
  /** Destructive actions and errors. */
  danger: string;
  /** Paper slip color. */
  paper: string;
  /** Text on a paper slip. */
  paperInk: string;
  /** Secondary text on a paper slip. */
  paperInk2: string;
  /** Bucket handle. */
  handle: string;
  /** Soft shadow under the bucket art. */
  artShadow: string;
  /** A bucket's own color; the default is a violet. Buckets store a token name, not a hex. */
  enamel: string;
  /** Enamel color when used as text, adjusted for contrast. */
  enamelText: string;
  /** Text drawn on top of the enamel color. */
  onEnamel: string;
};

/** Names of the color tokens. */
export type ColorToken = keyof ColorTokens;

/** Light theme colors. */
export const lightColors: ColorTokens = {
  bg: "#ffffff",
  sidebarBg: "#efeef2",
  paneBg: "#f6f6f8",
  text: "#1d1d1f",
  text2: "#6e6e73",
  text3: "#aeaeb2",
  sep: "rgba(60, 60, 67, 0.14)",
  fill: "rgba(120, 120, 128, 0.1)",
  fillStrong: "rgba(120, 120, 128, 0.2)",
  accent: "#007aff",
  danger: "#d70015",
  paper: "#fffdf6",
  paperInk: "#2b2a26",
  paperInk2: "#6f6a58",
  handle: "#a3a7ad",
  artShadow: "rgba(0, 0, 0, 0.1)",
  enamel: "#8b5cf6",
  enamelText: "#7a45ec",
  onEnamel: "#ffffff",
};

/** Dark theme colors. */
export const darkColors: ColorTokens = {
  bg: "#1c1c1e",
  sidebarBg: "#262628",
  paneBg: "#222224",
  text: "#f2f2f7",
  text2: "#a1a1a6",
  text3: "#636366",
  sep: "rgba(255, 255, 255, 0.1)",
  fill: "rgba(120, 120, 128, 0.22)",
  fillStrong: "rgba(120, 120, 128, 0.36)",
  accent: "#0a84ff",
  danger: "#ff453a",
  paper: "#efe9d7",
  paperInk: "#24231f",
  paperInk2: "#625d4c",
  handle: "#7d8288",
  artShadow: "rgba(0, 0, 0, 0.35)",
  enamel: "#8b5cf6",
  enamelText: "#8b5cf6",
  onEnamel: "#ffffff",
};

/** How a bucket color name looks in one theme (see `BUCKET_COLORS` in `@buckets/core`). */
export interface BucketPaint {
  /** Fill for the bucket art and swatches. */
  enamel: string;
  /** The color as text on the window background, darkened in light mode for contrast. */
  enamelText: string;
  /** Text drawn on top of the fill. */
  onEnamel: string;
}

/** The fill, text and on-fill colors of each bucket color, from the prototype. `accent` is the default violet. */
const bucketHues = {
  accent: { fill: "#8b5cf6", text: "#7a45ec", on: "#ffffff" },
  purple: { fill: "#8b5cf6", text: "#7442e8", on: "#ffffff" },
  blue: { fill: "#3b82d6", text: "#2a6cbd", on: "#ffffff" },
  teal: { fill: "#1f9ba0", text: "#137f84", on: "#ffffff" },
  green: { fill: "#2fa36b", text: "#1d8653", on: "#ffffff" },
  yellow: { fill: "#e8ac2e", text: "#9a6a05", on: "#2c2100" },
  pink: { fill: "#e0517a", text: "#c73862", on: "#ffffff" },
} as const;

/**
 * Looks up a bucket color. Unknown names fall back to the default, so a color added by a newer
 * version never breaks an older build.
 *
 * @param name - A bucket's `color` field.
 * @param theme - Which theme to paint for.
 * @returns The three colors.
 */
export function bucketPaint(name: string, theme: Theme): BucketPaint {
  const hue =
    (bucketHues as Record<string, (typeof bucketHues)[keyof typeof bucketHues]>)[name] ??
    bucketHues.accent;
  // On a dark background the fill itself reads well as text.
  return { enamel: hue.fill, enamelText: theme === "dark" ? hue.fill : hue.text, onEnamel: hue.on };
}

/**
 * CSS custom properties for one bucket's color, to set on the element that shows the bucket.
 *
 * @param name - A bucket's `color` field.
 * @param theme - Which theme to paint for.
 * @returns A map from custom property name to value.
 */
export function bucketColorVariables(name: string, theme: Theme): Record<string, string> {
  const paint = bucketPaint(name, theme);
  return {
    "--enamel": paint.enamel,
    "--enamel-text": paint.enamelText,
    "--on-enamel": paint.onEnamel,
  };
}

/** Shadow under raised cards, per theme. */
export const cardShadow = {
  light: "0 1px 1px rgba(0, 0, 0, 0.06), 0 8px 24px rgba(0, 0, 0, 0.08)",
  dark: "0 1px 1px rgba(0, 0, 0, 0.3), 0 10px 28px rgba(0, 0, 0, 0.45)",
} as const;

/** The ring drawn around a focused control. */
export const focusRing = "0 0 0 3px color-mix(in srgb, var(--accent) 38%, transparent)";

/** Fixed sizes. */
export const sizes = {
  /** Height of the toolbar above each pane. */
  toolbarH: "58px",
} as const;

/** Corner radii. */
export const radius = { s: "6px", m: "10px", l: "14px" } as const;

/** Spacing scale on a 4px base. */
export const spacing = {
  1: "4px",
  2: "8px",
  3: "12px",
  4: "16px",
  5: "20px",
  6: "24px",
  8: "32px",
} as const;

/** Motion values. Animations must also honor `prefers-reduced-motion` (AGENTS.md §7). */
export const motion = {
  /** Easing for most movement. */
  easeOut: "cubic-bezier(0.2, 0.8, 0.2, 1)",
} as const;

/** System font stack: SF on macOS, Segoe UI Variable on Windows, the system font elsewhere. */
export const fontStack =
  '-apple-system, BlinkMacSystemFont, "SF Pro Text", "Segoe UI Variable Text", "Segoe UI", system-ui, "Helvetica Neue", Arial, sans-serif';

/** Theme names. */
export type Theme = "light" | "dark";

/**
 * Converts a token name to its CSS custom property, for example `paperInk2` to `--paper-ink-2`.
 * @param token - Camel-case token name.
 * @returns The CSS custom property name.
 */
export function cssVariableName(token: string): string {
  return `--${token.replace(/([a-z])([A-Z0-9])/g, "$1-$2").toLowerCase()}`;
}

/**
 * Builds the CSS custom properties for one theme, for the app shell to set on `:root`.
 * @param theme - Which theme's colors to use.
 * @returns A map from custom property name to value.
 */
export function cssVariables(theme: Theme): Record<string, string> {
  const colors = theme === "dark" ? darkColors : lightColors;
  const variables: Record<string, string> = {};
  for (const [token, value] of Object.entries(colors)) {
    variables[cssVariableName(token)] = value;
  }
  for (const [size, value] of Object.entries(radius)) variables[`--r-${size}`] = value;
  for (const [step, value] of Object.entries(spacing)) variables[`--space-${step}`] = value;
  variables["--shadow-card"] = cardShadow[theme];
  variables["--focus-ring"] = focusRing;
  variables["--toolbar-h"] = sizes.toolbarH;
  Object.assign(variables, bucketColorVariables("accent", theme));
  variables["--ease-out"] = motion.easeOut;
  variables["--font"] = fontStack;
  return variables;
}

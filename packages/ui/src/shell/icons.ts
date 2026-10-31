// SPDX-License-Identifier: Apache-2.0

/** Icons a bucket can use (from the prototype). `"bucket"` is the default. */
export const ICON_CHOICES = [
  "bucket",
  "🎮",
  "🖥️",
  "🧹",
  "🍜",
  "📚",
  "🎬",
  "🌱",
  "🏃",
  "🎨",
  "✈️",
  "🎲",
  "🛠️",
] as const;

/**
 * Turns a bucket's stored icon name into something to draw.
 *
 * @param icon - The bucket's `icon` field.
 * @returns A glyph; the default name `"bucket"` becomes 🪣.
 */
export function iconGlyph(icon: string): string {
  return icon === "bucket" ? "🪣" : icon;
}

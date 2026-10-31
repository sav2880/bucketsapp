// SPDX-License-Identifier: Apache-2.0

/**
 * Names a bucket may use as its color. A bucket stores one of these names, never a hex value,
 * so the UI can pick the right shade for light and dark mode (plan.md §12). `accent` is the
 * default; the rest are the six colors from the prototype.
 */
export const BUCKET_COLORS = [
  "accent",
  "purple",
  "blue",
  "teal",
  "green",
  "yellow",
  "pink",
] as const;

/** One of {@link BUCKET_COLORS}. */
export type BucketColor = (typeof BUCKET_COLORS)[number];

/**
 * Whether a string names a bucket color.
 *
 * @param name - Candidate name.
 * @returns `true` when it is one of {@link BUCKET_COLORS}.
 */
export function isBucketColor(name: string): name is BucketColor {
  return (BUCKET_COLORS as readonly string[]).includes(name);
}

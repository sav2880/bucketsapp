// SPDX-License-Identifier: Apache-2.0

/** Units a stored {@link Duration} may use. Calendar units (months, years) are deliberately absent. */
export type DurationUnit = "minutes" | "hours" | "days";

/**
 * A length of time as stored in rules and reminders.
 *
 * Stored data never holds raw milliseconds (AGENTS.md §4); a tagged object is easy to
 * validate after a merge and needs no parser in `core`.
 */
export interface Duration {
  /** Unit of {@link Duration.value}. */
  readonly unit: DurationUnit;
  /** Non-negative, finite amount of `unit`. */
  readonly value: number;
}

const MS_PER_UNIT: Readonly<Record<DurationUnit, number>> = {
  minutes: 60_000,
  hours: 3_600_000,
  days: 86_400_000,
};

/**
 * Builds a {@link Duration}.
 *
 * @param value - Amount of `unit`.
 * @param unit - Unit of `value`.
 * @returns The duration.
 *
 * @example
 * ```ts
 * const cooldown = duration(24, "hours");
 * ```
 */
export function duration(value: number, unit: DurationUnit): Duration {
  return { unit, value };
}

/**
 * Converts a duration to milliseconds, for arithmetic at the edges only.
 *
 * @param d - The duration to convert.
 * @returns Milliseconds; never stored.
 */
export function durationToMs(d: Duration): number {
  return d.value * MS_PER_UNIT[d.unit];
}

/**
 * Narrows an untrusted value (for example from a merged document) to a {@link Duration}.
 *
 * @param input - Any value.
 * @returns The duration, or `undefined` when `input` is not a valid one.
 */
export function parseDuration(input: unknown): Duration | undefined {
  if (typeof input !== "object" || input === null) return undefined;
  const { unit, value } = input as { unit?: unknown; value?: unknown };
  if (typeof unit !== "string" || !Object.hasOwn(MS_PER_UNIT, unit)) return undefined;
  if (typeof value !== "number" || !Number.isFinite(value) || value < 0) return undefined;
  return { unit: unit as DurationUnit, value };
}

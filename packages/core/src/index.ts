// SPDX-License-Identifier: Apache-2.0

/** Name of this package; a placeholder until its milestone lands (plan.md §15). */
export const PACKAGE_NAME = "@buckets/core";

export { duration, durationToMs, parseDuration } from "./duration";
export type { Duration, DurationUnit } from "./duration";
export {
  createCryptoRng,
  createSeededRng,
  randomFloat,
  randomInt,
  type GetRandomValues,
  type Rng,
} from "./random/rng";
export * from "./model/commands";
export * from "./model/presets";
export type * from "./model/types";
export * from "./engine/derive";
export * from "./engine/draw";
export * from "./engine/resolve";
export * from "./reminders/next-fire-times";
export * from "./reminders/rrule";
export * from "./engine/compact";
export * from "./migrations";

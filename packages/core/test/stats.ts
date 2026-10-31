// SPDX-License-Identifier: Apache-2.0

/**
 * Counts how often each key occurs.
 *
 * @param keys - Observed keys.
 * @returns A map from key to count.
 */
export function countBy<K>(keys: Iterable<K>): Map<K, number> {
  const counts = new Map<K, number>();
  for (const key of keys) counts.set(key, (counts.get(key) ?? 0) + 1);
  return counts;
}

/**
 * Pearson chi-square statistic.
 *
 * @param observed - Observed counts per category.
 * @param expected - Expected counts per category, same length and all positive.
 * @returns The statistic; compare it with {@link chiSquareCritical}.
 */
export function chiSquare(observed: readonly number[], expected: readonly number[]): number {
  if (observed.length !== expected.length) throw new RangeError("length mismatch");
  let sum = 0;
  for (const [i, o] of observed.entries()) {
    const e = expected[i] ?? 0;
    if (e <= 0) throw new RangeError("expected counts must be positive");
    sum += (o - e) ** 2 / e;
  }
  return sum;
}

/**
 * Upper critical value of the chi-square distribution at p = 0.001.
 *
 * Wilson–Hilferty approximation; slightly conservative at small `df` (about 16.55 vs the
 * exact 16.27 at df = 3), which only makes the fairness checks less likely to fail by chance.
 *
 * @param df - Degrees of freedom, at least 1.
 * @returns The value a fair sample should stay below 99.9% of the time.
 */
export function chiSquareCritical(df: number): number {
  const z = 3.0902323; // standard normal quantile at 0.999
  const k = 2 / (9 * df);
  return df * (1 - k + z * Math.sqrt(k)) ** 3;
}

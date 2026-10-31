// SPDX-License-Identifier: Apache-2.0

/**
 * Source of randomness for the draw engine. `Math.random` is banned (AGENTS.md rule 6), so
 * everything random goes through this interface; see plan.md §6.3.
 */
export interface Rng {
  /** Returns the next uniformly distributed unsigned 32-bit integer. */
  nextUint32(): number;
}

const TWO_POW_32 = 4_294_967_296;

/**
 * Draws a float in [0, 1) with 53 bits of resolution.
 *
 * 53 bits (not 32) so that `u ** (1 / w)` keys in weighted sampling stay distinct for
 * small weights.
 *
 * @param rng - Random source.
 * @returns A float `x` with `0 <= x < 1`.
 */
export function randomFloat(rng: Rng): number {
  const high = rng.nextUint32() >>> 5; // 27 bits
  const low = rng.nextUint32() >>> 6; // 26 bits
  return (high * 67_108_864 + low) / 9_007_199_254_740_992;
}

/**
 * Draws an integer in [0, maxExclusive) without modulo bias, using rejection sampling.
 *
 * @param rng - Random source.
 * @param maxExclusive - Integer in [1, 2^32].
 * @returns An integer `n` with `0 <= n < maxExclusive`.
 */
export function randomInt(rng: Rng, maxExclusive: number): number {
  if (!Number.isInteger(maxExclusive) || maxExclusive < 1 || maxExclusive > TWO_POW_32) {
    throw new RangeError(
      `maxExclusive must be an integer in [1, 2^32], got ${String(maxExclusive)}`,
    );
  }
  // Largest multiple of maxExclusive that fits in 2^32; anything above it would favor low values.
  const limit = TWO_POW_32 - (TWO_POW_32 % maxExclusive);
  let n = rng.nextUint32();
  while (n >= limit) n = rng.nextUint32();
  return n % maxExclusive;
}

function splitmix32(state: number): () => number {
  let s = state >>> 0;
  return () => {
    s = (s + 0x9e3779b9) >>> 0;
    let z = s;
    z = Math.imul(z ^ (z >>> 16), 0x85ebca6b) >>> 0;
    z = Math.imul(z ^ (z >>> 13), 0xc2b2ae35) >>> 0;
    return (z ^ (z >>> 16)) >>> 0;
  };
}

/**
 * Creates a deterministic xoshiro128** generator for tests (plan.md §6.3).
 *
 * The seed is expanded with splitmix32 so that small seeds (1, 2, 3, …) still give
 * well-mixed, non-zero state.
 *
 * @param seed - Any integer; the same seed always gives the same sequence.
 * @returns A seeded {@link Rng}.
 *
 * @example
 * ```ts
 * const rng = createSeededRng(42);
 * ```
 */
export function createSeededRng(seed: number): Rng {
  const expand = splitmix32(seed);
  let a = expand();
  let b = expand();
  let c = expand();
  let d = expand();
  if ((a | b | c | d) === 0) a = 1; // the all-zero state is a fixed point
  return {
    nextUint32() {
      const result = Math.imul(rotl(Math.imul(b, 5), 7), 9) >>> 0;
      const t = b << 9;
      c ^= a;
      d ^= b;
      b ^= c;
      a ^= d;
      c ^= t;
      d = rotl(d, 11);
      a >>>= 0;
      b >>>= 0;
      c >>>= 0;
      d >>>= 0;
      return result;
    },
  };
}

function rotl(x: number, k: number): number {
  return ((x << k) | (x >>> (32 - k))) >>> 0;
}

/** Fills a typed array with cryptographically secure random values, like `crypto.getRandomValues`. */
export type GetRandomValues = (array: Uint32Array) => unknown;

/**
 * Creates the production {@link Rng} from a secure source.
 *
 * `core` has no DOM types, so the caller passes `crypto.getRandomValues` in.
 *
 * @param getRandomValues - Typically `(a) => crypto.getRandomValues(a)`.
 * @returns A cryptographically secure {@link Rng}.
 */
export function createCryptoRng(getRandomValues: GetRandomValues): Rng {
  const buffer = new Uint32Array(1);
  return {
    nextUint32() {
      getRandomValues(buffer);
      return buffer[0] ?? 0;
    },
  };
}

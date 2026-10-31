// SPDX-License-Identifier: Apache-2.0

import { describe, expect, it } from "vitest";
import { chiSquare, chiSquareCritical, countBy } from "../../test/stats";
import { createCryptoRng, createSeededRng, randomFloat, randomInt, type Rng } from "./rng";

/** A scripted source, to hit rejection-sampling branches deterministically. */
function scripted(values: number[]): Rng {
  let i = 0;
  return { nextUint32: () => values[i++] ?? 0 };
}

describe("createSeededRng", () => {
  it("is deterministic for a given seed", () => {
    const a = createSeededRng(42);
    const b = createSeededRng(42);
    for (let i = 0; i < 1000; i++) expect(a.nextUint32()).toBe(b.nextUint32());
  });

  it("gives different sequences for different seeds, including small ones", () => {
    expect(createSeededRng(1).nextUint32()).not.toBe(createSeededRng(2).nextUint32());
    expect(createSeededRng(0).nextUint32()).not.toBe(createSeededRng(1).nextUint32());
  });

  it("only produces unsigned 32-bit integers", () => {
    const rng = createSeededRng(7);
    for (let i = 0; i < 10_000; i++) {
      const n = rng.nextUint32();
      expect(Number.isInteger(n) && n >= 0 && n <= 0xffffffff).toBe(true);
    }
  });

  it("has uniform low bits (chi-square over 16 buckets)", () => {
    const rng = createSeededRng(3);
    const draws = 64_000;
    const counts = countBy(Array.from({ length: draws }, () => rng.nextUint32() & 15));
    const observed = Array.from({ length: 16 }, (_, k) => counts.get(k) ?? 0);
    expect(chiSquare(observed, Array<number>(16).fill(draws / 16))).toBeLessThan(
      chiSquareCritical(15),
    );
  });
});

describe("randomFloat", () => {
  it("stays in [0, 1)", () => {
    const rng = createSeededRng(5);
    for (let i = 0; i < 10_000; i++) {
      const x = randomFloat(rng);
      expect(x).toBeGreaterThanOrEqual(0);
      expect(x).toBeLessThan(1);
    }
  });

  it("reaches both ends of the range", () => {
    expect(randomFloat(scripted([0, 0]))).toBe(0);
    expect(randomFloat(scripted([0xffffffff, 0xffffffff]))).toBeLessThan(1);
    expect(randomFloat(scripted([0xffffffff, 0xffffffff]))).toBeGreaterThan(0.999999999);
  });
});

describe("randomInt", () => {
  it("covers every value of a small range evenly", () => {
    const rng = createSeededRng(9);
    const draws = 60_000;
    const counts = countBy(Array.from({ length: draws }, () => randomInt(rng, 6)));
    const observed = Array.from({ length: 6 }, (_, k) => counts.get(k) ?? 0);
    expect(chiSquare(observed, Array<number>(6).fill(draws / 6))).toBeLessThan(
      chiSquareCritical(5),
    );
  });

  it("rejects raw values in the biased tail instead of wrapping them", () => {
    // For max 3, 2^32 % 3 === 1, so 0xffffffff is the one biased value and must be skipped.
    expect(randomInt(scripted([0xffffffff, 2]), 3)).toBe(2);
  });

  it("returns 0 when there is only one choice", () => {
    expect(randomInt(createSeededRng(1), 1)).toBe(0);
  });

  it.each([0, -1, 1.5, Number.NaN, 2 ** 32 + 1])("rejects invalid max %d", (max) => {
    expect(() => randomInt(createSeededRng(1), max)).toThrow(RangeError);
  });
});

describe("createCryptoRng", () => {
  it("reads values from the supplied secure source", () => {
    const rng = createCryptoRng((array) => {
      array[0] = 123;
    });
    expect(rng.nextUint32()).toBe(123);
  });

  it("falls back to 0 if the source leaves the buffer empty", () => {
    expect(createCryptoRng(() => undefined).nextUint32()).toBe(0);
  });
});

/* SPDX-License-Identifier: Apache-2.0 */
/**
 * @file Unit tests for engine.js. Run with `node --test`.
 *
 * Randomness always comes from a seeded generator, so every run gives the
 * same draws. Statistical checks use fixed seeds and generous tolerances.
 */
'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const E = require('./engine.js');

const T0 = Date.UTC(2026, 8, 30, 9);
let counter = 0;
/** Deterministic event ids for tests. */
const mk = () => `id-${++counter}`;

/**
 * Builds a bucket from a preset with optional rule overrides.
 * @param {string} presetId
 * @param {Array<string | {title: string, weight?: number, createdAt?: number}>} entries
 * @param {Partial<import('./engine.js').BucketRules>} [overrides]
 */
function bucket(presetId, entries, overrides = {}) {
  return {
    rules: { ...E.PRESETS[presetId].rules, ...overrides },
    items: entries.map((e, i) => {
      const o = typeof e === 'string' ? { title: e } : e;
      return { id: `i${i}`, title: o.title, weight: o.weight ?? 1, createdAt: o.createdAt ?? T0 - 30 * E.DAY };
    }),
    events: [],
  };
}

/** Appends the events from a successful draw or resolve and returns the result. */
function apply(b, res) {
  assert.ok(res.ok, `expected success, got ${res.reason}`);
  if (res.events) b.events.push(...res.events);
  else b.events.push(res.event);
  return res;
}

const statusOf = (b, id, now) => E.deriveItems(b, now).find((s) => s.item.id === id).status;

test('every preset matches itself, and edited rules become custom', () => {
  for (const [id, p] of Object.entries(E.PRESETS)) {
    assert.equal(E.matchPreset({ ...p.rules }), id);
  }
  assert.equal(E.matchPreset({ ...E.PRESETS['grab-and-go'].rules, maxInHand: 4 }), 'custom');
});

test('Grab & Go locks until the drawn item is finished, then removes it', () => {
  const b = bucket('grab-and-go', ['A', 'B', 'C']);
  const rng = E.seededRng(1);
  const first = apply(b, E.draw(b, T0, rng, mk)).itemIds[0];

  const locked = E.checkDraw(b, T0);
  assert.equal(locked.ok, false);
  assert.equal(locked.reason, 'locked');
  assert.deepEqual(locked.holding.map((i) => i.id), [first]);

  apply(b, E.resolve(b, first, 'done', T0 + E.HOUR, { makeId: mk }));
  assert.equal(statusOf(b, first, T0 + E.HOUR), 'done');

  // The finished item can never come out again.
  for (let i = 0; i < 2; i++) {
    const r = apply(b, E.draw(b, T0 + 2 * E.HOUR, rng, mk));
    assert.notEqual(r.itemIds[0], first);
    apply(b, E.resolve(b, r.itemIds[0], 'done', T0 + 2 * E.HOUR, { makeId: mk }));
  }
  const empty = E.checkDraw(b, T0 + 3 * E.HOUR);
  assert.equal(empty.reason, 'empty');
  assert.equal(empty.doneCount, 3);
});

test('tossing back unlocks the bucket and returns the item unfinished', () => {
  const b = bucket('grab-and-go', ['A', 'B']);
  const id = apply(b, E.draw(b, T0, E.seededRng(2), mk)).itemIds[0];
  const res = apply(b, E.resolve(b, id, 'tossed-back', T0, { note: 'Not in the mood', makeId: mk }));
  assert.equal(res.event.note, 'Not in the mood');
  assert.equal(statusOf(b, id, T0), 'in');
  assert.equal(E.checkDraw(b, T0).ok, true);
});

test('resolve refuses items that are not in hand', () => {
  const b = bucket('grab-and-go', ['A']);
  assert.deepEqual(E.resolve(b, 'i0', 'done', T0), { ok: false, reason: 'not-in-hand' });
});

test('Rotation Pool: the 10-systems example from plan.md §6.2', () => {
  const b = bucket('rotation-pool', Array.from({ length: 10 }, (_, i) => `system-${i}`), { maxInHand: 1 });
  const rng = E.seededRng(7);
  let now = T0;
  const finished = new Set();

  // Finish 6 of the 10 systems; none may repeat.
  for (let k = 0; k < 6; k++) {
    const id = apply(b, E.draw(b, now, rng, mk)).itemIds[0];
    assert.ok(!finished.has(id), 'no repeats within a round');
    finished.add(id);
    now += E.HOUR;
    apply(b, E.resolve(b, id, 'done', now, { makeId: mk }));
    now += E.HOUR;
  }

  // Only the other 4 can come out now.
  const soon = E.checkDraw(b, now);
  assert.equal(soon.candidates.length, 4);
  for (const s of soon.candidates) assert.ok(!finished.has(s.item.id));

  // 30 days after they were finished, the 6 rejoin the pool.
  const later = now + 30 * E.DAY;
  assert.equal(E.checkDraw(b, later).candidates.length, 10);

  // With "prefer items still waiting", each untouched system is 3x as likely.
  const counts = new Map();
  const rng2 = E.seededRng(99);
  for (let i = 0; i < 30000; i++) {
    const id = E.draw(b, later, rng2, mk).itemIds[0];
    counts.set(id, (counts.get(id) || 0) + 1);
  }
  const avg = (pred) => {
    const xs = [...counts].filter(([id]) => pred(id)).map(([, c]) => c);
    return xs.reduce((a, c) => a + c, 0) / xs.length;
  };
  const ratio = avg((id) => !finished.has(id)) / avg((id) => finished.has(id));
  assert.ok(Math.abs(ratio - E.FAVOR_UNDRAWN_FACTOR) < 0.25, `ratio was ${ratio}`);
});

test('a new round starts once every item has had a turn', () => {
  const b = bucket('rotation-pool', ['A', 'B', 'C'], { maxInHand: 1, cycleResetDays: 0 });
  const rng = E.seededRng(3);
  const seen = new Set();
  for (let k = 0; k < 3; k++) {
    const r = apply(b, E.draw(b, T0, rng, mk));
    assert.equal(r.cycleReset, false);
    seen.add(r.itemIds[0]);
    apply(b, E.resolve(b, r.itemIds[0], 'done', T0, { makeId: mk }));
  }
  assert.equal(seen.size, 3);
  const next = E.draw(b, T0, rng, mk);
  assert.equal(next.cycleReset, true);
  assert.equal(next.events[0].kind, 'cycle-reset');
});

test('a toss-back gives the turn back unless the rule says it counts', () => {
  for (const counts of [false, true]) {
    const b = bucket('rotation-pool', ['A', 'B', 'C'], { maxInHand: 1, tossBackCountsAsDrawn: counts });
    const id = apply(b, E.draw(b, T0, E.seededRng(4), mk)).itemIds[0];
    apply(b, E.resolve(b, id, 'tossed-back', T0, { makeId: mk }));
    const ids = E.checkDraw(b, T0).candidates.map((s) => s.item.id);
    assert.equal(ids.includes(id), !counts);
  }
});

test('Mystery Bag items rest after they are finished', () => {
  const b = bucket('mystery-bag', ['Only item']);
  const id = apply(b, E.draw(b, T0, E.seededRng(5), mk)).itemIds[0];
  apply(b, E.resolve(b, id, 'done', T0, { makeId: mk }));
  const resting = E.checkDraw(b, T0 + E.HOUR);
  assert.equal(resting.reason, 'all-cooling-down');
  assert.equal(resting.opensAt, T0 + 24 * E.HOUR);
  assert.equal(E.checkDraw(b, T0 + 24 * E.HOUR).ok, true);
});

test('draw count is capped by room left in hand', () => {
  const b = bucket('weighted', ['A', 'B', 'C', 'D', 'E'], { maxInHand: 3, drawCount: 2 });
  const rng = E.seededRng(6);
  assert.equal(apply(b, E.draw(b, T0, rng, mk)).itemIds.length, 2);
  assert.equal(apply(b, E.draw(b, T0, rng, mk)).itemIds.length, 1);
  assert.equal(E.checkDraw(b, T0).reason, 'hand-full');
});

test('uniform draws are fair (chi-square, 4 items, 40k draws)', () => {
  const b = bucket('weighted', ['A', 'B', 'C', 'D'], { selection: 'uniform' });
  const rng = E.seededRng(11);
  const counts = { i0: 0, i1: 0, i2: 0, i3: 0 };
  const n = 40000;
  for (let i = 0; i < n; i++) counts[E.draw(b, T0, rng, mk).itemIds[0]] += 1;
  const expected = n / 4;
  const chi2 = Object.values(counts).reduce((a, c) => a + (c - expected) ** 2 / expected, 0);
  assert.ok(chi2 < 16.27, `chi-square ${chi2} exceeds the p=0.001 threshold for 3 degrees of freedom`);
});

test('weighted draws follow item weights', () => {
  const b = bucket('weighted', [
    { title: 'Heavy', weight: 3 },
    { title: 'Light', weight: 1 },
  ]);
  const rng = E.seededRng(12);
  let heavy = 0;
  const n = 20000;
  for (let i = 0; i < n; i++) if (E.draw(b, T0, rng, mk).itemIds[0] === 'i0') heavy += 1;
  assert.ok(Math.abs(heavy / n - 0.75) < 0.015, `heavy share was ${heavy / n}`);
});

test('weight 0 is never drawn, and all-zero weights fall back to chance', () => {
  const b = bucket('weighted', [
    { title: 'Never', weight: 0 },
    { title: 'Always', weight: 1 },
  ]);
  const rng = E.seededRng(13);
  for (let i = 0; i < 500; i++) assert.equal(E.draw(b, T0, rng, mk).itemIds[0], 'i1');

  const zeros = bucket('weighted', [
    { title: 'A', weight: 0 },
    { title: 'B', weight: 0 },
  ]);
  assert.equal(E.draw(zeros, T0, rng, mk).itemIds.length, 1);
});

test('Simmer favours items that have waited longer', () => {
  const b = bucket('simmer', [
    { title: 'Old', createdAt: T0 - 60 * E.DAY },
    { title: 'New', createdAt: T0 },
  ]);
  const rng = E.seededRng(14);
  let old = 0;
  for (let i = 0; i < 10000; i++) if (E.draw(b, T0, rng, mk).itemIds[0] === 'i0') old += 1;
  // Weights 31 vs 1, so "Old" should win about 97% of the time.
  assert.ok(old / 10000 > 0.95, `old share was ${old / 10000}`);
});

test('history for removed items is ignored', () => {
  const b = bucket('grab-and-go', ['A', 'B']);
  b.events.push(E.recordDraw('i0', T0, mk));
  b.items = b.items.filter((i) => i.id !== 'i0');
  const states = E.deriveItems(b, T0);
  assert.equal(states.length, 1);
  assert.equal(E.checkDraw(b, T0).ok, true, 'a removed item no longer locks the bucket');
});

test('draw never mutates its input', () => {
  const b = bucket('rotation-pool', ['A', 'B']);
  const before = JSON.stringify(b);
  E.draw(b, T0, E.seededRng(15), mk);
  assert.equal(JSON.stringify(b), before);
});

test('seeded generator is deterministic and in range', () => {
  const a = E.seededRng(42);
  const b = E.seededRng(42);
  for (let i = 0; i < 1000; i++) {
    const x = a();
    assert.equal(x, b());
    assert.ok(x >= 0 && x < 1);
  }
});

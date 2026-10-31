/* SPDX-License-Identifier: Apache-2.0 */
/**
 * @file Buckets prototype: draw engine.
 *
 * A dependency-free implementation of the draw rules in plan.md §6. Every
 * function is pure: nothing here touches the DOM, reads the clock, or uses
 * global randomness. Time (`now`, epoch milliseconds) and randomness (`rng`)
 * are always passed in, so the same inputs give the same outputs and tests
 * are reproducible.
 *
 * Item state is never stored. It is derived from the bucket's append-only
 * event history (plan.md §5), which is what lets edits from several devices
 * merge later.
 *
 * Loads in browsers (as `window.BucketsEngine`) and in Node (as a CommonJS
 * module) so it can be unit-tested with `node --test`.
 */
(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) {
    module.exports = api;
  } else {
    root.BucketsEngine = api;
  }
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  /** One hour in milliseconds. */
  const HOUR = 3600000;
  /** One day in milliseconds. */
  const DAY = 24 * HOUR;
  /** Weight multiplier for items still waiting for a turn (plan.md §6.2, step 5). */
  const FAVOR_UNDRAWN_FACTOR = 3;

  /**
   * @typedef {Object} BucketRules
   * @property {number} drawCount Items pulled per draw.
   * @property {number} maxInHand Most unresolved items allowed at once.
   * @property {boolean} lockUntilResolved Refuse draws while anything is in hand.
   * @property {'remove'|'return'} onDone What happens to a finished item.
   * @property {number} cooldownHours Rest time after an item returns (0 = none).
   * @property {boolean} noRepeat Every item gets a turn before anything repeats.
   * @property {number} cycleResetDays Finished items rejoin the pool after this many days (0 = off).
   * @property {boolean} favorUndrawn Prefer items still waiting for a turn this round.
   * @property {boolean} tossBackCountsAsDrawn Whether tossing back uses up the item's turn.
   * @property {'uniform'|'weighted'|'aging'} selection How candidates are weighted.
   * @property {number} agingRatePerDay Extra weight per day waiting (aging only).
   * @property {boolean} hideTitlesUntilDrawn Mystery Bag behaviour (used by the UI).
   * @property {'none'|'simple'|'deliberate'} tossBackConfirm Friction before tossing back (used by the UI).
   */

  /**
   * @typedef {Object} Item
   * @property {string} id
   * @property {string} title
   * @property {number} weight Relative weight for weighted selection.
   * @property {number} createdAt Epoch ms; the starting point for aging.
   */

  /**
   * @typedef {Object} DrawEvent
   * @property {string} id
   * @property {'drawn'|'done'|'tossed-back'|'cycle-reset'} kind
   * @property {string} [itemId] Absent for `cycle-reset`.
   * @property {number} at Epoch ms.
   * @property {'remove'|'return'} [onDone] Rule snapshot on `done`, so later rule edits don't rewrite history.
   * @property {number} [cooldownMs] Rule snapshot on `done`.
   * @property {boolean} [countsAsDrawn] Rule snapshot on `tossed-back`.
   * @property {string} [note] Optional reason given for a toss-back.
   */

  /**
   * @typedef {Object} ItemState
   * @property {Item} item
   * @property {'in'|'hand'|'cooling'|'done'} status
   * @property {number|null} heldSince When the item was drawn, if in hand.
   * @property {number|null} lastDrawnAt
   * @property {number|null} lastDoneAt
   * @property {number} timesDrawn
   * @property {number} timesDone
   * @property {number} cooldownUntil Epoch ms; 0 when not resting.
   * @property {boolean} drawnThisCycle Whether the item has had its turn this round.
   */

  /** Rule defaults shared by every preset. Frozen so presets can't drift. */
  const BASE_RULES = Object.freeze({
    drawCount: 1,
    maxInHand: 1,
    lockUntilResolved: false,
    onDone: 'return',
    cooldownHours: 0,
    noRepeat: false,
    cycleResetDays: 0,
    favorUndrawn: false,
    tossBackCountsAsDrawn: false,
    selection: 'uniform',
    agingRatePerDay: 0,
    hideTitlesUntilDrawn: false,
    tossBackConfirm: 'simple',
  });

  /**
   * Bucket types (plan.md §6.4). A preset is only a named starting point:
   * users can change any rule afterwards.
   */
  const PRESETS = Object.freeze({
    'grab-and-go': {
      name: 'Grab & Go',
      summary: 'Draw one at a time and finish it before drawing again. Finished items leave the bucket.',
      rules: Object.freeze({ ...BASE_RULES, onDone: 'remove', lockUntilResolved: true, tossBackConfirm: 'deliberate' }),
    },
    'rotation-pool': {
      name: 'Rotation Pool',
      summary: 'Finished items go back in. Everything gets a turn before anything repeats.',
      rules: Object.freeze({ ...BASE_RULES, maxInHand: 2, noRepeat: true, cycleResetDays: 30, favorUndrawn: true }),
    },
    weighted: {
      name: 'Weighted Bucket',
      summary: 'Heavier items come up more often. Nothing is guaranteed.',
      rules: Object.freeze({ ...BASE_RULES, selection: 'weighted', tossBackConfirm: 'none' }),
    },
    simmer: {
      name: 'Simmer Bucket',
      summary: 'The longer something waits, the more likely it is to come up.',
      rules: Object.freeze({ ...BASE_RULES, selection: 'aging', agingRatePerDay: 0.5, tossBackConfirm: 'none' }),
    },
    'mystery-bag': {
      name: 'Mystery Bag',
      summary: "You can't see what's inside until you draw it. Finished items rest for a day, then go back in.",
      rules: Object.freeze({
        ...BASE_RULES,
        hideTitlesUntilDrawn: true,
        lockUntilResolved: true,
        cooldownHours: 24,
        tossBackConfirm: 'deliberate',
      }),
    },
  });

  /**
   * Finds the preset whose rules exactly match, or `'custom'`.
   * @param {BucketRules} rules
   * @returns {string} A preset id or `'custom'`.
   */
  function matchPreset(rules) {
    const keys = Object.keys(BASE_RULES);
    for (const [id, preset] of Object.entries(PRESETS)) {
      if (keys.every((k) => preset.rules[k] === rules[k])) return id;
    }
    return 'custom';
  }

  /**
   * Replays a bucket's event history to work out where every item is.
   *
   * Events for items that no longer exist are skipped, so deleting an item
   * never breaks the history.
   *
   * @param {{items: Item[], events: DrawEvent[]}} bucket
   * @param {number} now Epoch ms; decides which items are still resting.
   * @returns {ItemState[]} One entry per item, in the bucket's item order.
   */
  function deriveItems(bucket, now) {
    /** @type {Map<string, ItemState & {prevDrawnThisCycle: boolean}>} */
    const states = new Map();
    for (const item of bucket.items) {
      states.set(item.id, {
        item,
        status: 'in',
        heldSince: null,
        lastDrawnAt: null,
        lastDoneAt: null,
        timesDrawn: 0,
        timesDone: 0,
        cooldownUntil: 0,
        drawnThisCycle: false,
        prevDrawnThisCycle: false,
      });
    }

    for (const ev of bucket.events) {
      if (ev.kind === 'cycle-reset') {
        for (const s of states.values()) s.drawnThisCycle = false;
        continue;
      }
      const s = states.get(ev.itemId);
      if (!s) continue; // The item was removed; its history stays but is ignored.
      switch (ev.kind) {
        case 'drawn':
          // Remember the previous flag so a toss-back that "doesn't count" can undo it.
          s.prevDrawnThisCycle = s.drawnThisCycle;
          s.status = 'hand';
          s.heldSince = ev.at;
          s.lastDrawnAt = ev.at;
          s.timesDrawn += 1;
          s.drawnThisCycle = true;
          break;
        case 'done':
          s.timesDone += 1;
          s.lastDoneAt = ev.at;
          s.heldSince = null;
          if (ev.onDone === 'remove') {
            s.status = 'done';
          } else {
            s.status = 'in';
            s.cooldownUntil = ev.at + (ev.cooldownMs || 0);
          }
          break;
        case 'tossed-back':
          s.status = 'in';
          s.heldSince = null;
          if (!ev.countsAsDrawn) s.drawnThisCycle = s.prevDrawnThisCycle;
          break;
        default:
          break;
      }
    }

    const out = [];
    for (const s of states.values()) {
      if (s.status === 'in' && s.cooldownUntil > now) s.status = 'cooling';
      delete s.prevDrawnThisCycle;
      out.push(s);
    }
    return out;
  }

  /**
   * Whether an item that already had its turn may rejoin the pool early
   * because it was finished long enough ago (`cycleResetDays`).
   * @param {ItemState} s
   * @param {BucketRules} rules
   * @param {number} now
   * @returns {boolean}
   */
  function isStale(s, rules, now) {
    return rules.cycleResetDays > 0 && s.lastDoneAt !== null && now - s.lastDoneAt >= rules.cycleResetDays * DAY;
  }

  /**
   * Checks whether a draw is possible right now, without drawing.
   *
   * Follows plan.md §6.2 steps 2–4. On success it returns the candidate pool;
   * otherwise it returns a typed refusal the UI can explain.
   *
   * @param {{rules: BucketRules, items: Item[], events: DrawEvent[]}} bucket
   * @param {number} now
   * @returns {{ok: true, count: number, candidates: ItemState[], needsCycleReset: boolean}
   *   | {ok: false, reason: 'locked'|'hand-full', holding: Item[]}
   *   | {ok: false, reason: 'all-cooling-down', opensAt: number}
   *   | {ok: false, reason: 'empty', doneCount: number}}
   */
  function checkDraw(bucket, now) {
    const rules = bucket.rules;
    const states = deriveItems(bucket, now);
    const inHand = states.filter((s) => s.status === 'hand');

    if (rules.lockUntilResolved && inHand.length > 0) {
      return { ok: false, reason: 'locked', holding: inHand.map((s) => s.item) };
    }
    const room = rules.maxInHand - inHand.length;
    if (room <= 0) {
      return { ok: false, reason: 'hand-full', holding: inHand.map((s) => s.item) };
    }

    const available = states.filter((s) => s.status === 'in');
    if (available.length === 0) {
      const resting = states.filter((s) => s.status === 'cooling');
      if (resting.length > 0) {
        return { ok: false, reason: 'all-cooling-down', opensAt: Math.min(...resting.map((s) => s.cooldownUntil)) };
      }
      return { ok: false, reason: 'empty', doneCount: states.filter((s) => s.status === 'done').length };
    }

    let candidates = available;
    let needsCycleReset = false;
    if (rules.noRepeat) {
      const waiting = available.filter((s) => !s.drawnThisCycle || isStale(s, rules, now));
      if (waiting.length === 0) {
        // Everyone has had a turn: the next draw starts a new round.
        needsCycleReset = true;
      } else {
        candidates = waiting;
      }
    }
    return { ok: true, count: Math.min(rules.drawCount, room), candidates, needsCycleReset };
  }

  /**
   * Relative chance of a candidate being drawn (plan.md §6.2, step 5).
   * @param {ItemState} s
   * @param {BucketRules} rules
   * @param {number} now
   * @param {boolean} afterReset True when this draw starts a new round.
   * @returns {number} A weight ≥ 0.
   */
  function weightOf(s, rules, now, afterReset) {
    let w = 1;
    if (rules.selection === 'weighted') {
      w = Math.max(0, Number(s.item.weight) || 0);
    } else if (rules.selection === 'aging') {
      const since = s.lastDrawnAt ?? s.item.createdAt ?? now;
      w = 1 + Math.max(0, rules.agingRatePerDay) * Math.max(0, (now - since) / DAY);
    }
    if (rules.noRepeat && rules.favorUndrawn && !afterReset && !s.drawnThisCycle) {
      w *= FAVOR_UNDRAWN_FACTOR;
    }
    return w;
  }

  /**
   * Weighted sampling without replacement (Efraimidis–Spirakis): each entry
   * gets the key u^(1/w) and the n largest keys win. Entries with weight ≤ 0
   * are never picked.
   *
   * @template T
   * @param {{value: T, weight: number}[]} entries
   * @param {number} n How many to pick.
   * @param {() => number} rng Returns a float in [0, 1).
   * @returns {T[]} Up to n picked values.
   */
  function weightedSample(entries, n, rng) {
    const keyed = [];
    for (const e of entries) {
      if (!(e.weight > 0)) continue;
      const u = 1 - rng(); // (0, 1], so the key is never 0^x.
      keyed.push({ value: e.value, key: Math.pow(u, 1 / e.weight) });
    }
    keyed.sort((a, b) => b.key - a.key);
    return keyed.slice(0, n).map((k) => k.value);
  }

  let idCounter = 0;
  /**
   * Default event id factory. Uses `crypto.randomUUID` where available.
   * @returns {string}
   */
  function defaultId() {
    const c = globalThis.crypto;
    if (c && typeof c.randomUUID === 'function') return c.randomUUID();
    idCounter += 1;
    return `ev-${idCounter.toString(36)}-${Math.floor(rngFallbackSeed()).toString(36)}`;
  }
  /** Non-random uniquifier for ids when `randomUUID` is missing (not used for draws). */
  function rngFallbackSeed() {
    return typeof performance !== 'undefined' ? performance.now() * 1000 : idCounter;
  }

  /**
   * Draws from a bucket. Pure: returns the events to append and never
   * mutates `bucket`.
   *
   * @param {{rules: BucketRules, items: Item[], events: DrawEvent[]}} bucket
   * @param {number} now
   * @param {() => number} rng Use `cryptoRng` in the app, `seededRng` in tests.
   * @param {() => string} [makeId] Event id factory.
   * @returns {{ok: true, events: DrawEvent[], itemIds: string[], cycleReset: boolean}
   *   | ReturnType<typeof checkDraw>}
   */
  function draw(bucket, now, rng, makeId = defaultId) {
    const check = checkDraw(bucket, now);
    if (!check.ok) return check;

    const events = [];
    if (check.needsCycleReset) events.push({ id: makeId(), kind: 'cycle-reset', at: now });

    let entries = check.candidates.map((s) => ({
      value: s,
      weight: weightOf(s, bucket.rules, now, check.needsCycleReset),
    }));
    // If every weight is 0, fall back to pure chance rather than refusing.
    if (!entries.some((e) => e.weight > 0)) entries = entries.map((e) => ({ ...e, weight: 1 }));

    const picks = weightedSample(entries, check.count, rng);
    for (const s of picks) events.push({ id: makeId(), kind: 'drawn', itemId: s.item.id, at: now });
    return { ok: true, events, itemIds: picks.map((s) => s.item.id), cycleReset: check.needsCycleReset };
  }

  /**
   * Builds a `drawn` event for a specific item, skipping all rules. Only for
   * seeding demo history and tests.
   * @param {string} itemId
   * @param {number} at
   * @param {() => string} [makeId]
   * @returns {DrawEvent}
   */
  function recordDraw(itemId, at, makeId = defaultId) {
    return { id: makeId(), kind: 'drawn', itemId, at };
  }

  /**
   * Resolves an in-hand item as done or tossed back. The current rules are
   * copied into the event, so editing rules later never rewrites history.
   *
   * @param {{rules: BucketRules, items: Item[], events: DrawEvent[]}} bucket
   * @param {string} itemId
   * @param {'done'|'tossed-back'} kind
   * @param {number} now
   * @param {{note?: string, makeId?: () => string}} [options]
   * @returns {{ok: true, event: DrawEvent} | {ok: false, reason: 'not-in-hand'|'unknown-kind'}}
   */
  function resolve(bucket, itemId, kind, now, options = {}) {
    const s = deriveItems(bucket, now).find((x) => x.item.id === itemId);
    if (!s || s.status !== 'hand') return { ok: false, reason: 'not-in-hand' };
    const rules = bucket.rules;
    const id = (options.makeId || defaultId)();
    if (kind === 'done') {
      const cooldownMs = rules.onDone === 'return' ? Math.max(0, rules.cooldownHours) * HOUR : 0;
      return { ok: true, event: { id, kind: 'done', itemId, at: now, onDone: rules.onDone, cooldownMs } };
    }
    if (kind === 'tossed-back') {
      const event = { id, kind: 'tossed-back', itemId, at: now, countsAsDrawn: rules.tossBackCountsAsDrawn };
      if (options.note) event.note = options.note;
      return { ok: true, event };
    }
    return { ok: false, reason: 'unknown-kind' };
  }

  /**
   * Production randomness from `crypto.getRandomValues` (plan.md §6.3).
   * @returns {number} A float in [0, 1).
   */
  function cryptoRng() {
    const buf = new Uint32Array(1);
    globalThis.crypto.getRandomValues(buf);
    return buf[0] / 4294967296;
  }

  /**
   * Deterministic generator for tests (mulberry32). Not for production use.
   * @param {number} seed
   * @returns {() => number} Returns floats in [0, 1).
   */
  function seededRng(seed) {
    let a = seed >>> 0;
    return function next() {
      a = (a + 0x6d2b79f5) >>> 0;
      let t = a;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  return Object.freeze({
    HOUR,
    DAY,
    FAVOR_UNDRAWN_FACTOR,
    BASE_RULES,
    PRESETS,
    matchPreset,
    deriveItems,
    isStale,
    checkDraw,
    weightOf,
    weightedSample,
    draw,
    recordDraw,
    resolve,
    cryptoRng,
    seededRng,
  });
});

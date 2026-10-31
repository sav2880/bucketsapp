# ADR 0001: Decisions made while building the M1 draw engine

- **Status:** accepted (2026-10-30), pending maintainer review of the M1 change
- **Context:** plan.md §5–§8 left several types and call shapes open. M1 ported `prototype/engine.js` to `packages/core` and had to settle them.

## Decisions

### 1. `Duration` is a tagged object

`{ unit: "minutes" | "hours" | "days"; value: number }`. It is easy to validate after a merge (`parseDuration` rejects anything malformed), needs no parser in `core`, and keeps raw milliseconds out of stored data (AGENTS.md §4). ISO 8601 strings (`PT24H`) were rejected because a malformed string can arrive from a merged document and `core` would need a parser. Calendar units are excluded because a "month" has no fixed length.

The prototype's `cooldownMs` event snapshot becomes `cooldown: Duration`.

### 2. Commands mutate the bucket they are given

AGENTS.md §8 says changes are applied "in an Automerge `change()`", which hands the function a mutable draft. Pure functions that return new objects cannot be used there without a copy that defeats the CRDT's change tracking. Commands therefore change their argument in place, but stay deterministic: no I/O, no clock, no id generation (all arrive in a `CommandContext`). `draw`, `resolve`, `checkDraw`, `deriveItems` and `nextFireTimes` remain pure and never mutate.

### 3. xoshiro128** replaces mulberry32

plan.md §6.3 and AGENTS.md name xoshiro128**. The prototype used mulberry32. Sequences for a given seed therefore differ, so the ported statistical tests use fresh seeds and tolerances (chi-square at p = 0.001, 100,000 draws) instead of copied values.

### 4. `Rng` exposes raw 32-bit integers

`randomInt` needs raw bits for rejection sampling to be meaningful, and `randomFloat` combines two draws into 53 bits so tiny weights keep distinct keys in weighted sampling. `createCryptoRng` takes `getRandomValues` as a parameter because `core` has no DOM types.

### 5. Documented differences from the prototype

| Area | Prototype | `core` | Why |
|---|---|---|---|
| Aging weight | `1 + rate × days` | `item.weight × (1 + rate × days)` | plan.md §6.2 step 5 |
| `favorUndrawn` | Only with `noRepeat` | Whenever on, until a new cycle starts | plan.md §6.2 step 5 does not require `noRepeat` |
| `noRepeat` | boolean | `"off" \| "until-cycle-complete"` | plan.md §6.1 |
| Permissions and `inHandScope` | none | role checks; per-member hands | plan.md §6.2 steps 1–2 |
| Event ids | `crypto.randomUUID` with a `performance.now()` fallback | injected `makeId` | `core` reads no clock or globals |
| Concurrent events | not considered | earliest draw wins; repeated finishes ignored; replay sorted by time then id | merging devices (plan.md §5) |
| Selection | uniform, weighted, aging | adds `round-robin` | plan.md §6.1 |

### 6. Compaction stores a baseline, not counters

plan.md §5 said older events would roll up into "per-item summary counters". Counters alone cannot reproduce derived state: who holds an item, when its cooldown ends and whether a toss-back may still undo a draw all depend on order. `compactHistory` instead stores the exact replay state at a cutoff (`Bucket.baseline`) and deletes the older events. The cutoff is rounded down to a UTC month so devices that compact on different days write identical results. A property test checks that derived state never changes.

### 7. RRULE subset, no dependency

The `rrule` library reads the clock and has had time-zone defects, and AGENTS.md rule 8 requires approval for new dependencies. `core` supports DAILY, WEEKLY and MONTHLY with INTERVAL, BYDAY, BYMONTHDAY, BYHOUR and BYMINUTE, and returns typed errors for everything else. See plan.md §7.1.

### 8. Migrations are a mechanism with no steps yet

Both formats are at version 1 and nothing has shipped, so inventing a version 0 would be fiction. `createMigrator` provides the walk, the refusal of newer documents and the error reporting, tested with a synthetic three-version history. The first real schema change adds a step and bumps the version (AGENTS.md rule 10).

### 9. Automatic return is derived, not written

Daily Draw sends unfinished items back at a time of day. Writing return events would need a clock tick, a time zone and a rule for which device writes them when several are open, and nothing would happen while every device is closed. Instead `deriveItems` treats an item as returned once the first `autoReturnAt` after it was drawn has passed, using the new optional `Bucket.timeZone` (UTC when absent). There is nothing to coordinate between devices. The cost: history shows no explicit "returned" entry, and the rule reads the bucket's current rules because there is no event to snapshot them. Compaction replays the same rule, and a test checks derived state is unchanged by it. `timeZone` is optional, so no schema bump was needed.

## Consequences

- `packages/sync` can apply the commands inside `change()` and must not edit documents any other way.
- The first schema change must add a step to `migrateBucket` or `migrateLibrary`.
- The Daily Draw preset (2 items at a time, unfinished items return at `00:00`) has no prototype equivalent; the maintainer chose the number (plan.md decision 14).
- The prototype now lives in `docs/prototype/` as frozen history.

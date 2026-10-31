# AGENTS.md: guide for AI coding agents

This file tells AI agents (and humans) how to work in the Buckets repository. Read it fully before making changes. **[plan.md](plan.md) is the source of truth** for architecture and scope. If a task conflicts with plan.md, stop and ask rather than guess.

## 1. Golden rules

1. **Never say "to-do".** User-facing text says *bucket* and *item*, never "to-do", "todo", "task list", or "checklist". `scripts/check-terminology.ts` enforces this. Code identifiers follow the same vocabulary (`Bucket`, `Item`, `draw`, `inHand`, `tossBack`).
2. **`pnpm check` must pass before you report a task as finished.** If you couldn't run it, say so explicitly, and say which parts you did run.
3. **No change without tests.** Bug fixes start with a failing test that reproduces the bug.
4. **Document everything exported.** Every exported function, type, component, and constant gets a TSDoc comment. Public Rust items get rustdoc comments.
5. **Keep `@buckets/core` pure.** No DOM, no I/O, no `Date.now()`, no randomness from globals. Time and RNG are always passed in as parameters.
6. **`Math.random` is banned.** All randomness goes through the `Rng` interface in `packages/core/src/random/`.
7. **Never weaken quality gates.** Don't disable lint rules, lower coverage thresholds, add `// @ts-ignore`, or skip tests to make something pass. If a rule truly doesn't fit, explain why in the PR and get approval.
8. **Ask before adding dependencies.** Justify each one: size, maintenance health, license, and why existing tools aren't enough.
9. **Respect the license split.** Start every new source file with an SPDX header: `// SPDX-License-Identifier: Apache-2.0` in `apps/` and `packages/`, and `AGPL-3.0-only` in `server/`. Client code must never import from `server/`, and client dependencies must use permissive licenses (plan.md §14).
10. **Don't change the file format or the sync folder layout casually.** Any schema change needs a version bump, a migration in `core`, and migration tests.

## 2. Repository map

| Path | Purpose | Notes |
|---|---|---|
| `packages/core` | Model, rules, draw engine, derived state, migrations | Pure; ≥ 95% line coverage |
| `packages/crypto` | Keys, encryption, signing, recovery key (libsodium) | Imports nothing internal; ≥ 95% line coverage |
| `packages/ui` | React components, design tokens, bucket SVG and animations | No direct platform APIs; use adapters |
| `packages/storage` | `StorageAdapter` implementations (Tauri FS, IndexedDB, File System Access) | Atomic writes only |
| `packages/sync` | automerge-repo setup, folder sync, server client | Writes only to its own device folder |
| `packages/export` | Exporters and importers | Each format round-trip tested where import exists |
| `apps/web` | PWA entry and service worker | Wiring only |
| `apps/desktop` | Tauri entry; Rust in `src-tauri/` | Keep Rust thin: menus, window effects, plugins |
| `server/` | Sync server | Dockerized |
| `e2e/` | Playwright | Use `data-testid`, not CSS selectors |
| `docs/prototype/` | Archived clickable HTML prototype (plain JS, npm) | Its engine was ported to `core` in M1; see §12 |

**Import direction:** apps → ui → (storage, sync, export) → (core, crypto). `storage` and `sync` may import `core` and `crypto`; `export` may import `core`. Nothing imports from an app. `core` and `crypto` import nothing internal. ESLint enforces this per package (`eslint.config.js`).

## 3. Commands

```bash
pnpm install          # install everything
pnpm check            # full gate: lint, format, types, terminology, tests, rust
pnpm lint             # ESLint, zero warnings
pnpm typecheck        # tsc --noEmit
pnpm test             # Vitest
pnpm test:coverage    # with thresholds
pnpm test:e2e         # Playwright (builds web first)
pnpm test:rust        # fmt --check, clippy -D warnings, cargo test
pnpm dev:web          # local web app
pnpm dev:desktop      # Tauri dev window
```

To run one package: `pnpm --filter @buckets/core test`.

## 4. TypeScript conventions

- `strict`, `noUncheckedIndexedAccess`, and `exactOptionalPropertyTypes` are all on. No `any`. Use `unknown` and narrow it.
- Use named exports only; no default exports except where a framework requires them.
- Name files in `kebab-case.ts` and components in `PascalCase.tsx`. Put one component per file.
- Return typed results instead of throwing for expected outcomes. For example, `draw()` returns `{ ok: false, reason: "locked", opensAt }`. Throw only for programmer errors.
- Dates are ISO 8601 strings in stored data and `Temporal`/`Date` only at the edges.
- Durations use the shared `Duration` type from `core`, never raw milliseconds in stored data.
- Strings shown to users come from `packages/ui/src/locales/en.json`, never hard-coded in components.

### Documentation style

````ts
/**
 * Draws items from a bucket according to its rules.
 *
 * Pure: never mutates `bucket`. Returns the events to append, or a typed
 * refusal the UI can explain to the user.
 *
 * @param bucket - The bucket to draw from.
 * @param request - Who is drawing, plus `now` (injected so results are reproducible), `rng`
 *   (use `createSeededRng` in tests) and an id source.
 * @returns New `drawn` events, or a refusal with its reason.
 *
 * @example
 * ```ts
 * const result = draw(bucket, { memberId, deviceId, now: new Date("2026-01-01"), rng: createSeededRng(42), makeId });
 * if (result.ok) applyEvents(bucket, result.events);
 * ```
 */
export function draw(bucket: Bucket, request: DrawRequest): DrawResult { … }
````

Comment the *why* for any non-obvious logic, such as weighting formulas, sync edge cases, or platform workarounds. Link to the relevant plan.md section (for example, `// See plan.md §6.2 step 3`).

## 5. Rust conventions (`apps/desktop/src-tauri`)

- Run `cargo fmt`. `clippy -D warnings` must be clean. Crate-level `#![warn(missing_docs)]` is on.
- Never use `unwrap()` or `expect()` outside tests. Return `Result` values with errors that serialize cleanly to the frontend.
- Business logic belongs in TypeScript `core`, not Rust. Rust handles OS integration only.

## 6. Testing guide

| What | How |
|---|---|
| Draw rules | Seeded RNG (`createSeededRng(seed)`) plus a fixed `now` |
| Randomness fairness | 100k seeded draws plus a chi-square check; helpers in `core/test/stats.ts` |
| Invariants | fast-check property tests (e.g., never exceed `maxInHand`) |
| Time-based rules | Advance the injected `now`. Never sleep and never use real timers. |
| Components | Testing Library; query by role and label, not class names |
| Sync | Two in-memory repos plus a fake folder; simulate offline, concurrent edits, and partial files |
| File I/O | Temp directories; assert writes are atomic |
| E2E | Main flows in `e2e/`; run on Chromium, WebKit, and Firefox |

Name tests by behavior: `it("won't repeat an item until every item has been drawn")`.

The scenarios in plan.md §6.2 (including the 10-systems example) must exist as executable tests.

## 7. UI guidelines

- Use design tokens (`packages/ui/src/tokens`) for color, spacing, radius, and motion. Never use raw hex values or pixel values in components.
- Every animation must check `prefers-reduced-motion` (use the `useMotionPreference` hook).
- Every interactive element must be reachable by keyboard and have an accessible name. Announce draw results through the shared live region.
- Resizable panes and columns use the shared `ResizableLayout` and `ResizableColumns` components, which handle limits, collapse, and persistence.
- The design leans macOS on every platform. Platform differences go through `usePlatform()`, not user-agent sniffing scattered across components.

## 8. Sync and data rules

- All changes to a library go through `core` command functions (such as `addItem` or `recordDone`) applied in an Automerge `change()`. Never edit the document ad hoc in UI code.
- Item status is derived from events. Don't add stored status fields.
- Folder sync: a device writes only to `devices/<its own id>/`. It never deletes or modifies another device's files.
- Any change that affects merging needs a two-device concurrency test.

## 9. Definition of done

- [ ] `pnpm check` passes. Report the output summary.
- [ ] New and changed behavior has tests. Coverage thresholds still hold.
- [ ] Every exported symbol has TSDoc or rustdoc.
- [ ] User-facing strings are in the locale file and pass the terminology check.
- [ ] UI changes work in light and dark mode, with the keyboard, and with reduced motion.
- [ ] plan.md is updated if scope, architecture, or the data format changed. An ADR is added in `docs/adr/` for significant decisions.
- [ ] README.md is updated if commands, prerequisites, or setup changed.

## 10. Commits and pull requests

- Sign off every commit with `git commit -s` (DCO). CI rejects commits without a `Signed-off-by:` line. Use the human maintainer's name and email, never an invented identity.
- Use Conventional Commits: `feat(core): …`, `fix(sync): …`, `docs: …`, `test: …`, `chore: …`.
- Keep pull requests to one logical change.
- Pull request descriptions cover what changed, why, how it was tested, and any plan.md sections affected.

## 11. When unsure

Don't guess on product questions. Add the question to plan.md §18 (Open questions) and ask the maintainer. On technical questions, prefer the simplest approach that satisfies plan.md and keeps `core` pure.

## 12. Current state and the prototype

- **The monorepo in §2 is partly in place.** M0 slice 1 added the pnpm workspace with empty package stubs, strict TypeScript, ESLint, Prettier, Vitest and `pnpm check`. Slice 3 added design tokens (`packages/ui/src/tokens`), a placeholder icon (`docs/design/app-icon.svg`) and the CI workflow. Slice 2 added the empty Tauri 2 window (`apps/desktop/src-tauri`), so `pnpm test:rust` now runs `cargo fmt --check`, `clippy -D warnings`, `cargo test` and `cargo deny check`; it needs Rust and `cargo-deny` installed. M0 is complete: CI is green on all three OSes and the window has been opened by hand on each one.
- **M1 is built in `packages/core`** (see plan.md §15 and `docs/adr/0001-core-engine-decisions.md`): model, presets, commands, derived state, `draw` and `resolve`, `nextFireTimes`, history compaction and migrations. Commands change the bucket they are given so they can run inside an Automerge `change()`; everything else is pure. Test helpers live in `packages/core/test/` (excluded from coverage). `pnpm --filter @buckets/core test` runs just that package.
- **Two gates exist:** `pnpm check` at the root for the workspace, and `cd docs/prototype && npm run check` for the archived prototype (ESLint, engine unit tests, build, jsdom smoke tests). `docs/prototype/` is outside the pnpm workspace; run both when you touch both.
- `docs/prototype/` is plain JavaScript with JSDoc, not TypeScript. It's exempt from the TypeScript and package rules above, but rules 1, 3, 4, 5, 6 and 9 still apply.
- `docs/prototype/engine.js` was the reference for plan.md §6 and has been ported to `packages/core`, with every scenario from `engine.test.js`. The prototype was moved there unchanged after M1; the differences from `core` are listed in the ADR. Treat it as frozen history: change it only to keep its own gate green.


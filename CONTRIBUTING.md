# Contributing to Buckets

Thanks for helping. [AGENTS.md](AGENTS.md) holds the full rules and applies to humans as much as to AI agents. [plan.md](plan.md) is the source of truth for scope and architecture. If your change conflicts with it, open an issue first.

## Set up

You need Node 22 or newer and pnpm (see the version pinned in `package.json`; `corepack enable` installs it). The [README](README.md) lists the extra tools for desktop builds.

```bash
pnpm install
pnpm check
```

`pnpm check` is the quality gate. It runs lint, a format check, type checking, the terminology, SPDX and license checks, the tests with coverage thresholds, and the Rust checks. It must pass before you open a pull request. If you change `prototype/`, also run `cd prototype && npm run check`.

## Rules that trip people up

- **Vocabulary:** say _bucket_ and _item_ in user-facing text and code. Never "to-do", "task list", "subtask" or "checklist". `pnpm check:terminology` enforces this.
- **Tests:** every change needs tests. A bug fix starts with a failing test.
- **Docs:** every exported symbol gets a TSDoc comment.
- **Headers:** every source file starts with an SPDX header: `Apache-2.0` in `apps/` and `packages/`, `AGPL-3.0-only` in `server/`.
- **Dependencies:** ask before adding one, and say why existing tools aren't enough. Client dependencies must use permissive licenses.
- **Randomness:** never use `Math.random`. Pass an `Rng` in.

## Commits and pull requests

- Sign off every commit with `git commit -s`. This certifies the [Developer Certificate of Origin](https://developercertificate.org), and CI rejects pull requests with unsigned commits.
- Use [Conventional Commits](https://www.conventionalcommits.org): `feat(core): …`, `fix(sync): …`, `docs: …`, `test: …`, `chore: …`.
- Keep each pull request to one logical change.
- In the description, cover what changed, why, how you tested it, and which plan.md sections it affects.

## Licensing of contributions

By contributing you agree your work is released under the license of the part you change: Apache-2.0 for `apps/` and `packages/`, AGPL-3.0-only for `server/`. Because of the DCO, relicensing the server later would need every contributor's consent.

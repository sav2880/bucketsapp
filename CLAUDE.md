@AGENTS.md

<!-- The line above imports AGENTS.md so Claude Code and other agents share one rulebook.
     Keep this file short: it loads into every session. -->

## Claude Code notes

- **Where things stand:** planning is done (plan.md v0.7). M0 is complete. M1 (draw engine) is built in `packages/core` and awaits maintainer review; the next milestone is M2 (app shell and editing). One open question (the bundle identifier) is in plan.md §18. The prototype now lives in `docs/prototype/` as frozen history.
- **Quality gate:** `pnpm check` at the root; also `cd docs/prototype && npm run check` if you touched `docs/prototype/`. Run the gate before saying a task is finished, and report the result. `pnpm check` includes the Rust checks, so Rust and `cargo-deny` must be installed.
- **Use plan mode first** for anything that touches the data model (plan.md §5), the draw engine (§6), sync or encryption (§9), or sharing (§10).
- **Keep docs in step:** if scope, architecture, commands or the file format change, update plan.md, README.md and AGENTS.md in the same change.
- **Commits:** never commit or push unless asked. When asked, use `git commit -s` with the maintainer's own name and email from `git config`. If those aren't set, stop and ask.
- **Personal notes** go in `CLAUDE.local.md`, which is gitignored.

@AGENTS.md

<!-- The line above imports AGENTS.md so Claude Code and other agents share one rulebook.
     Keep this file short: it loads into every session. -->

## Claude Code notes

- **Where things stand:** planning is done (plan.md v0.5, no open questions). The only runnable code is `prototype/`. The next milestone is M0, repo foundations (plan.md §15).
- **Quality gate today:** `cd prototype && npm run check`. After M0 it becomes `pnpm check` at the root. Run the gate before saying a task is finished, and report the result.
- **Use plan mode first** for anything that touches the data model (plan.md §5), the draw engine (§6), sync or encryption (§9), or sharing (§10).
- **Keep docs in step:** if scope, architecture, commands or the file format change, update plan.md, README.md and AGENTS.md in the same change.
- **Commits:** never commit or push unless asked. When asked, use `git commit -s` with the maintainer's own name and email from `git config`. If those aren't set, stop and ask.
- **Personal notes** go in `CLAUDE.local.md`, which is gitignored.

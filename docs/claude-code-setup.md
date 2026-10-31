# Moving Buckets to Claude Code and VS Code

This guide takes the exported Buckets repo from a zip file to a working Claude Code session inside VS Code. It covers macOS, Windows and Linux.

Claude Code changes often. If a step here doesn't match what you see, the official docs win: [Claude Code setup](https://code.claude.com/docs/en/setup) and [Claude Code in VS Code](https://code.claude.com/docs/en/vs-code).

## 1. What's in the repo

```
buckets/
├─ CLAUDE.md              Claude Code entry point. Imports AGENTS.md, adds Claude-specific notes
├─ AGENTS.md              Rules for any AI coding agent (golden rules, repo map, conventions)
├─ plan.md                Source of truth: architecture, data model, draw rules, milestones
├─ README.md              Human-facing overview and commands
├─ LICENSE                Apache-2.0 (apps and packages; server/ will be AGPL-3.0-only)
├─ .claude/settings.json  Shared Claude Code permissions for this repo
├─ .vscode/               Recommended extensions, settings, tasks and launch configs
├─ .editorconfig  .gitattributes  .gitignore  .nvmrc
├─ docs/
│  └─ claude-code-setup.md   This file
└─ docs/prototype/        Clickable HTML prototype with its engine, tests and build script
```

The monorepo described in AGENTS.md §2 (`apps/`, `packages/`, `server/`) doesn't exist yet. Building it is milestone M0, and it's the first thing to ask Claude Code to do (see section 8).

## 2. Prerequisites

| Tool | Version | Notes |
|---|---|---|
| Git | Any recent | On Windows, install [Git for Windows](https://git-scm.com/downloads/win). Claude Code uses its Git Bash for shell commands. Without it, Claude Code falls back to PowerShell. |
| Node.js | 22 LTS or newer | The prototype needs Node 20 or newer; the planned monorepo needs 22. `.nvmrc` pins 22 for nvm, fnm or Volta users. |
| VS Code | 1.98.0 or newer | Required by the Claude Code extension |
| A Claude plan with Claude Code | Pro, Max, Team, Enterprise, or a Console account | The free claude.ai plan doesn't include Claude Code |

## 3. Unpack the repo and make the first commit

Pick a folder for your projects, unzip `buckets-repo.zip` there, and open a terminal in the new `buckets` folder.

**macOS and Linux**

```bash
cd ~/Projects                       # or wherever you keep code
unzip ~/Downloads/buckets-repo.zip
cd buckets
```

**Windows (PowerShell)**

```powershell
cd $HOME\Projects
Expand-Archive $HOME\Downloads\buckets-repo.zip -DestinationPath .
cd buckets
```

Then, on any OS:

```bash
git init -b main
git config user.name  "Your Name"          # skip if already set globally
git config user.email "you@example.com"
git add -A
git commit -s -m "chore: import planning docs and prototype"
```

The `-s` adds the `Signed-off-by:` line the project requires (DCO; see README.md "Contributing"). To push to GitHub or another host, create an empty repo there and follow its "push an existing repository" instructions.

## 4. Check the prototype runs

This proves Node and npm work before Claude Code gets involved.

```bash
cd docs/prototype
npm ci
npm run check     # expect: lint clean, 16 engine tests and 6 smoke tests passing
cd ..
```

Open `docs/prototype/dist/buckets-prototype.html` in a browser to see the prototype.

## 5. Install Claude Code

There are two pieces. You can use either or both.

- **The VS Code extension** gives you a Claude panel inside the editor, with inline diffs, @-mentions of files, and plan review. This is the recommended way to use Claude Code in VS Code.
- **The command-line tool (`claude`)** runs in any terminal, including VS Code's integrated terminal. You need the standalone install for this.

### 5a. The VS Code extension

1. Open VS Code.
2. Open the Extensions view: `Cmd+Shift+X` on macOS, `Ctrl+Shift+X` on Windows and Linux.
3. Search for **Claude Code** (publisher: Anthropic) and click **Install**.
4. If it doesn't appear afterwards, run **Developer: Reload Window** from the Command Palette.

You'll also be prompted to install it in step 6, because the repo recommends it in `.vscode/extensions.json`.

### 5b. The command-line tool

**macOS, Linux, WSL**

```bash
curl -fsSL https://claude.ai/install.sh | bash
```

**Windows (PowerShell)**

```powershell
irm https://claude.ai/install.ps1 | iex
```

Alternatives: `brew install --cask claude-code` on macOS, `winget install Anthropic.ClaudeCode` on Windows, or the signed apt and dnf repositories on Linux (see the setup docs). Homebrew and WinGet installs don't auto-update, so upgrade them yourself now and then.

Open a **new** terminal and check it worked:

```bash
claude --version
claude doctor       # read-only health check of the install and settings
```

If the shell says `claude` isn't found, the install folder isn't on your PATH yet. See [Troubleshoot installation](https://code.claude.com/docs/en/troubleshoot-install).

## 6. Open the repo in VS Code

1. Open the folder: **File → Open Folder… → buckets**, or run `code .` from the `buckets` folder. On macOS, if `code` isn't found, run **Shell Command: Install 'code' command in PATH** from the Command Palette first.
2. When VS Code asks whether you trust the authors of this folder, choose **Trust**. You wrote it.
3. When VS Code offers the **recommended extensions** (Claude Code, ESLint, EditorConfig), click **Install all**.
4. Open the Claude Code panel by clicking the Claude (spark) icon in the editor toolbar, or by searching "Claude Code" in the Command Palette. You can drag the panel anywhere in the window.
5. Sign in when prompted. A browser window opens. Sign in with the account that has Claude Code access, then return to VS Code.
6. If Claude Code asks whether to trust this folder, say yes. The repo's shared permission rules in `.claude/settings.json` only take effect once you trust the folder.

## 7. Confirm Claude Code sees the project rules

In the Claude panel (or in `claude` in a terminal), type:

```
/context
```

Under **Memory files** you should see `CLAUDE.md`. Its first line is `@AGENTS.md`, which pulls AGENTS.md in with it, so Claude gets the golden rules, repo map and conventions in every session.

Then ask a quick question to make sure the rules landed:

```
In two sentences: what's the quality gate right now, and what milestone comes next?
```

Expected answer: `cd docs/prototype && npm run check`, and M0 (repo foundations).

### How the files fit together

| File | Who reads it | Purpose |
|---|---|---|
| `AGENTS.md` | Claude Code (through the import) and other coding agents | The shared rulebook. Edit rules here. |
| `CLAUDE.md` | Claude Code | Imports AGENTS.md and adds Claude-only notes. Keep it short: it loads into every session. |
| `CLAUDE.local.md` | Claude Code, only on your machine | Your personal notes for this project. Gitignored. Create it if you want one. |
| `.claude/settings.json` | Claude Code | Shared permissions. npm scripts and read-only git commands run without asking; commits and pushes ask first; `.env` files are never read. |
| `.claude/settings.local.json` | Claude Code, only on your machine | Your personal overrides. Gitignored. |

## 8. Using it day to day

### In the Claude panel

- Type a request and Claude proposes edits. Review each diff and accept or reject it.
- Mention files with `@`, for example `@plan.md` or `@docs/prototype/engine.js`. Text you select in the editor is shared with Claude automatically.
- Switch permission modes with the mode indicator in the panel. Use **plan mode** before big changes: Claude writes a plan for you to approve before it touches any files. CLAUDE.md asks for plan mode on data-model, engine, sync and sharing work.

### In the terminal

Run `claude` in VS Code's integrated terminal (`` Ctrl+` ``) from the repo root. If you run `claude` in a terminal outside VS Code, type `/ide` to connect it to your VS Code window so diffs open in the editor.

Useful commands in a session:

| Command | What it does |
|---|---|
| `/context` | What's loaded: instruction files, rules, context use |
| `/memory` | Open or edit CLAUDE.md, CLAUDE.local.md and auto memory |
| `/config` | Settings panel |
| `/resume` | Pick up an earlier conversation |
| `/compact` | Shrink a long conversation; CLAUDE.md is re-read afterwards |

### VS Code tasks and debugging

The repo includes these, so you don't need to remember commands:

- **Terminal → Run Task…**
  - *Prototype: install* runs `npm ci`.
  - *Prototype: check (lint + tests)* is the quality gate, also bound to **Run Test Task**.
  - *Prototype: build* builds the page, also bound to `Cmd/Ctrl+Shift+B`.
  - *Prototype: engine tests only* runs just the engine tests.
- **Run and Debug** (`Cmd/Ctrl+Shift+D`)
  - *Prototype: open in Chrome* (or *Edge*) builds the page and opens it with the debugger attached, so breakpoints in the page's scripts work.
  - *Prototype: debug engine tests* and *debug smoke tests* run the tests with breakpoints.

## 9. Your first prompts

Start in plan mode for the first one. Paste these one at a time and review each result before moving on.

**1. Orientation (no changes)**

```
Read plan.md, AGENTS.md and docs/prototype/README.md. Summarise the architecture
in ten bullet points and list anything in plan.md §15 M0 that is ambiguous
or that you'd need me to decide. Don't change any files.
```

**2. Milestone M0: repo foundations**

```
Plan milestone M0 from plan.md §15: the pnpm monorepo layout in AGENTS.md §2,
TypeScript strict config, ESLint and Prettier, Vitest, the terminology check
script, SPDX headers, the license check, and a `pnpm check` that runs all of
it. Keep docs/prototype/ working as-is. Show me the plan before writing files.
```

**3. Milestone M1: draw engine**

```
Port docs/prototype/engine.js to packages/core in TypeScript, following AGENTS.md
§4 and plan.md §6. Port every test in docs/prototype/engine.test.js to Vitest
first and confirm they fail, then implement until they pass. Add the
fast-check invariants listed in AGENTS.md §6.
```

After each milestone, ask Claude to update plan.md and README.md if anything changed, then commit with `git commit -s`.

## 10. Platform notes

- **Windows:** you can run Claude Code natively or inside WSL 2. Native is fine for this project. Use WSL 2 if you want Claude's sandboxed command execution, which native Windows doesn't support. `.gitattributes` keeps line endings as LF on every OS, so Windows clones match the others.
- **macOS:** desktop builds later need Xcode Command Line Tools (`xcode-select --install`); see README.md.
- **Linux:** for Tauri desktop work after M0, install the [Tauri prerequisites](https://v2.tauri.app/start/prerequisites/). Note that README.md's feature list and build steps still describe only Web, Windows and macOS. Linux packages (AppImage, deb, rpm) were added to plan.md, and README.md should catch up during M0.

## 11. Troubleshooting

| Problem | Fix |
|---|---|
| `claude: command not found` | Open a new terminal. If it still fails, see [Fix your PATH](https://code.claude.com/docs/en/troubleshoot-install). |
| The extension doesn't appear after installing | Run **Developer: Reload Window**, or restart VS Code. |
| Claude ignores the project rules | Run `/context` and check CLAUDE.md is listed. Make sure you opened the `buckets` folder itself, not a parent folder. |
| Claude asks permission for every npm command | Trust the folder when Claude Code asks; shared allow rules wait for that. Check `/config` too. |
| `npm ci` fails | Check `node --version` is 20 or newer. Delete `docs/prototype/node_modules` and retry. |
| ESLint shows nothing in the editor | Install the ESLint extension and run `npm ci` in `docs/prototype/`. The workspace settings point ESLint at that folder. |
| Diffs from a terminal session don't open in VS Code | Run `/ide` inside the session to connect to the editor. |

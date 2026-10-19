# 🪣 Buckets

**Stop deciding. Start drawing.**

Buckets holds the things you want to do: games to play, systems to maintain, chores, ideas. When you're ready, you reach in and pull one out. Different bucket types decide *how* things come out and *what happens* when you're finished.

> **Status: pre-alpha (planning).** The commands below describe the planned workflow. They go live when milestone M0 lands. See [plan.md](plan.md).
>
> What runs today is the clickable prototype in [`prototype/`](prototype/README.md): `cd prototype && npm ci && npm run check`, then open `prototype/dist/buckets-prototype.html`.

## Bucket types

| Type | How it works |
|---|---|
| **Grab & Go** | Draw a random item. Finish it and it's gone. Optionally, no new draw until you've finished what's in your hand. |
| **Rotation Pool** | Finished items go back in. No repeats until everything has had a turn, with optional cooldowns and reset timers. |
| **Weighted Bucket** | Give items more weight to see them more often. |
| **Simmer Bucket** | Items you haven't seen in a while become more likely. |
| **Mystery Bag** | You can't see what's inside until you draw it. |
| **Daily Draw** | A fresh handful every morning. |
| **Round Robin** | Strict, fair rotation. |
| **Nested Buckets** | Draw a bucket, then draw from it. |

Every rule can be adjusted per bucket.

## Features

- **Web, Windows, and macOS** from one codebase (Tauri 2 + React). The web app also works offline.
- **Files:** Open, Save, Save As, and autosave to a single `.buckets` file.
- **Export** to Markdown, HTML, PDF, JSON, CSV, or plain text. **Import** from Markdown, JSON, CSV, or pasted text.
- **Sync without accounts:** point Buckets at a folder in iCloud Drive, Dropbox, OneDrive, or Syncthing.
- **Real-time sync (optional):** run the sync server yourself with Docker.
- **Native feel:** a macOS-style design, resizable panes and columns, light and dark mode, and full keyboard support.

## Prerequisites

| Tool | Version | Needed for |
|---|---|---|
| [Node.js](https://nodejs.org) | 22 LTS or newer | Everything |
| [pnpm](https://pnpm.io) | 12 (pinned in `package.json`; `corepack enable`) | Everything |
| [Rust](https://rustup.rs) | Latest stable via `rustup` | Desktop builds and `pnpm check` |
| [cargo-deny](https://github.com/EmbarkStudios/cargo-deny) | `cargo install --locked cargo-deny` | `pnpm check` (Rust license and advisory check) |
| Docker | Any recent version | Running the sync server (optional) |

### Platform setup

**macOS**

```bash
xcode-select --install                                        # Command Line Tools
rustup target add aarch64-apple-darwin x86_64-apple-darwin    # for universal builds
```

**Windows**

1. Install the [Visual Studio Build Tools](https://visualstudio.microsoft.com/visual-cpp-build-tools/) and select **Desktop development with C++**.
2. Install the WebView2 runtime. It's preinstalled on Windows 11. On Windows 10, install the Evergreen runtime.
3. Install Rust with `rustup-init.exe` and accept the default MSVC toolchain.

**Linux (development only, for working on the shared packages and the web build)**

Follow the [Tauri Linux prerequisites](https://v2.tauri.app/start/prerequisites/) if you also want to run the desktop shell.

## Getting started

```bash
git clone <repo-url> buckets && cd buckets
corepack enable
pnpm install
pnpm dev:web        # web app at http://localhost:5173
pnpm dev:desktop    # desktop app with hot reload
```

## Commands

| Command | What it does |
|---|---|
| `pnpm check` | **Run before every commit.** Runs lint, format check, type-check, terminology check, unit tests, and Rust checks. |
| `pnpm lint` | ESLint (zero warnings allowed) |
| `pnpm format` | Format all files with Prettier and `cargo fmt` |
| `pnpm typecheck` | `tsc --noEmit` across all packages |
| `pnpm test` | Unit and component tests (Vitest) |
| `pnpm test:coverage` | Tests with coverage thresholds enforced |
| `pnpm test:e2e` | Playwright tests against the web build |
| `pnpm test:rust` | `cargo fmt --check`, `cargo clippy -D warnings`, `cargo test` |
| `pnpm build:web` | Production PWA in `apps/web/dist` |
| `pnpm build:desktop` | Builds the desktop app for the current OS. Installers (`.dmg`, `.msi`, `.deb` and so on) are switched off until M12; for now the binary lands in `apps/desktop/src-tauri/target/release/` |

## Building releases

**Web**

```bash
pnpm build:web
# Deploy apps/web/dist to any static host (it must be served over HTTPS for offline mode).
```

**macOS** (universal binary for Apple silicon and Intel)

```bash
pnpm build:desktop -- --target universal-apple-darwin
# Output: apps/desktop/src-tauri/target/universal-apple-darwin/release/bundle/{dmg,macos}/
```

**Windows**

```powershell
pnpm build:desktop
# Output: apps\desktop\src-tauri\target\release\bundle\{msi,nsis}\
```

Each OS builds its own installers. CI builds both platforms on every pull request (see `.github/workflows/`). Signing needs certificates that are configured as CI secrets. Unsigned builds work but show OS security warnings.

## Running the sync server (optional)

```bash
cd server
cp .env.example .env    # set PUBLIC_URL and a strong ADMIN_SECRET
docker compose up -d
```

Put it behind HTTPS. `server/README.md` includes a Caddy example. In Buckets, open **Settings → Sync → Add Server**, enter the URL, and scan the QR code on your other devices.

## Project layout

```
apps/web          Web app (PWA)
apps/desktop      Desktop app (Tauri; Rust in src-tauri/)
packages/core     Data model and draw engine (pure TypeScript)
packages/crypto   Keys, encryption and signing (libsodium)
packages/ui       React components and bucket visuals
packages/storage  File and browser storage adapters
packages/sync     Folder sync and sync-server client
packages/export   Exporters and importers
server/           Self-hostable sync server
e2e/              Playwright tests
scripts/          Repo checks (terminology, SPDX headers, licenses)
docs/             Architecture notes and design assets
prototype/        Clickable HTML prototype (plain JS; reference for M1)
```

## Documentation

- [plan.md](plan.md): architecture, data model, draw rules, milestones, and open questions
- [AGENTS.md](AGENTS.md): rules for AI coding agents (and a good checklist for humans)
- [CLAUDE.md](CLAUDE.md): Claude Code entry point; imports AGENTS.md
- [docs/claude-code-setup.md](docs/claude-code-setup.md): set up this repo with Claude Code and VS Code
- `docs/adr/`: architecture decision records

## Contributing

1. Create a branch and make your change.
2. Add or update tests and docs.
3. Make sure `pnpm check` passes.
4. Sign off every commit with `git commit -s`. This certifies the [Developer Certificate of Origin](https://developercertificate.org), and pull requests without sign-off can't be merged.
5. Open a pull request using a [Conventional Commits](https://www.conventionalcommits.org) title, such as `feat(core): add aging selection`.

## License

- Apps and shared packages (`apps/`, `packages/`): [Apache-2.0](LICENSE)
- Sync server (`server/`): [AGPL-3.0-only](server/LICENSE)

If you run a modified version of the sync server for other people, the AGPL requires you to publish your changes.

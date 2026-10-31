# Buckets prototype

A clickable, single-page prototype of drawing from a bucket. It exists to try the *feel* of Buckets (the bucket, slips, cards, rules) before the real app is built in M0–M4. It is **not** the app: there's no sync, no files, and time is simulated.

## Run it

Requires Node 20 or newer. The commands are the same on macOS, Windows and Linux.

```bash
npm ci            # install ESLint, globals and jsdom (dev only)
npm run check     # lint, engine unit tests, build, jsdom smoke tests
npm run build     # writes dist/buckets-prototype.html
```

Open `dist/buckets-prototype.html` in any modern browser. It's fully self-contained and works offline. In VS Code, use **Run and Debug → Prototype: open in Chrome** (or Edge).

## Files

| File | What it is |
|---|---|
| `engine.js` | Pure draw engine (plan.md §6). No DOM, clock or global randomness. **Ported to `packages/core` in M1.** |
| `engine.test.js` | 16 unit tests: the 10-systems example, fairness (chi-square), weighting, aging, resting time, rounds, toss-back rules |
| `app.js` | UI layer: rendering, animations, sheets, resizable panes and columns, shortcuts |
| `styles.css` | Light/dark tokens, layout, bucket art, cards, inspector |
| `index.template.html` | Page skeleton with the inline SVG bucket |
| `build.js` | Inlines CSS and JS into one HTML file |
| `smoke.test.js` | Loads the built page in jsdom and clicks through each bucket type |
| `eslint.config.js` | Bans `Math.random`, requires `===`, standard recommended rules |

## Things to try

- **Game Backlog (Grab & Go):** draw, see the lid close, toss back (asks twice), finish to the done pile.
- **Server Maintenance (Rotation Pool):** only 4 of 10 can come up; press **+30 days** and all 10 are back.
- **Chores (Mystery Bag):** names hidden until a slip flips over; finished chores rest a day.
- Drag pane edges and list-column edges; double-click to reset or auto-fit.
- Shortcuts: ⌘/Ctrl+D draw, ⌘/Ctrl+Enter done, ⌘/Ctrl+Backspace toss back, N new item.

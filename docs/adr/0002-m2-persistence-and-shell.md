# ADR 0002: Decisions made while building M2 (persistence and the app shell)

- **Status:** accepted (2026-10-31), pending maintainer review of the M2 change
- **Context:** plan.md §5, §8 and §12 left open how documents are stored, how items move between buckets and how pictures are handled. M2 had to settle them.

## Decisions

### 1. Automerge lives in `packages/storage`, not in `core`

`core` stays pure and has no Automerge dependency. `LibraryStore` holds the Automerge documents and runs each core command inside `Automerge.change` (this is why ADR 0001 made commands change their argument in place). Two rules follow from Automerge: commands never write `undefined`, and they never assign a filtered copy of a list of objects, so removals use `splice` (which also merges better).

### 2. One storage interface, three implementations

`StorageAdapter` reads, writes, lists and removes bytes by key. Memory is for tests, IndexedDB is for the web, and Tauri files are for desktop. The Tauri adapter takes `invoke` as a parameter so the package never imports Tauri. Keys are strict (one to four parts, no dots-only parts, no slashes inside a part) and Rust checks them again.

### 3. Atomic files written in Rust

`storage_write` writes a temp file in the same folder, syncs it, renames it over the target and, on Unix, syncs the folder. A crash leaves the old file or the new one, never half of one. Bytes travel raw, not as JSON. The content security policy gained `wasm-unsafe-eval` (Automerge ships WebAssembly) and `blob:` in `img-src` (thumbnails).

### 4. Saves are snapshots, debounced

Each changed document is saved whole (`Automerge.save`) 300 ms after the last change, and when the window is hidden or closed. Incremental saves would save a few bytes at the cost of a compaction scheme; revisit in M4 when files and autosave land. Loading migrates first; newer or damaged documents are left untouched and listed.

### 5. Moving an item copies its definition and leaves its history

See plan.md §8.5. History would not make sense in another bucket, whose rules and members differ. The two-step move (add, then remove) trades a possible duplicate after a crash for never losing an item.

### 6. Pictures are plain bytes keyed by hash until M5

Content addressing gives free de-duplication. M5 encrypts, which makes the id the hash of the ciphertext, so existing pictures need a migration then. Cleanup of unreferenced pictures waits for M4.

### 7. The browser does the picture work

`createImageBitmap` and a canvas decode, scale and re-encode. Re-encoding removes EXIF (including location) for free. No image library was added. Costs: an animated GIF keeps only its first frame, and HEIC works only where the engine can decode it.

### 8. `AppRoot` holds all startup wiring

Both apps differ only in the storage they pass to `AppRoot` (`packages/ui`), so there is one place that opens the library, makes the environment and saves on hide. The member id is made on first run and kept in the device settings until sharing (M9) replaces it.

### 9. Our own column component, a library for panes

`react-resizable-panels` handles panes. Columns are our own `ResizableColumns` because the table needs auto-fit and proportional shrinking, which the library does not offer.

## Known gaps

- Desktop links can only be copied; the Tauri opener plugin will fix that (plan.md §17, decision 26).
- The bundle identifier is now `io.github.sav2880.buckets` (decision 21). Data saved under the development identifier has to be moved by hand once.
- jsdom can't test real pane dragging or the picture canvas, so those rely on the Playwright tests and manual checks.

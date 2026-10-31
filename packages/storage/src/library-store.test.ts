// SPDX-License-Identifier: Apache-2.0

import * as Automerge from "@automerge/automerge";
import {
  addItem,
  applyEvents,
  compactHistory,
  createSeededRng,
  draw,
  duration,
  addLink,
  addStep,
  convertItemToStep,
  convertStepToItem,
  createBucket,
  createLibrary,
  removeAttachment,
  removeItem,
  removeLink,
  removeStep,
  reorderBuckets,
  reorderSteps,
  setItemNotes,
  setStepDone,
  addAttachment,
  type Bucket,
  type CommandContext,
  type CommandResult,
} from "@buckets/core";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { StorageAdapter } from "./adapter";
import { openLibraryStore, type LibraryStore } from "./library-store";
import { createMemoryStorage } from "./memory";

const NOW = new Date("2026-10-30T09:00:00.000Z");

function ctxFor(prefix = "id"): CommandContext {
  let n = 0;
  return { memberId: "me", now: NOW, makeId: () => `${prefix}-${String(++n)}` };
}

const REF = { keyId: "k", role: "owner", addedAt: NOW.toISOString() } as const;

async function open(adapter: StorageAdapter, saveDelayMs = 300): Promise<LibraryStore> {
  const result = await openLibraryStore(adapter, {
    newLibrary: () => createLibrary("Me", ctxFor("lib")),
    saveDelayMs,
  });
  if (!result.ok) throw new Error(`could not open: ${result.problem.kind}`);
  return result.store;
}

function ok<T>(result: CommandResult<T>): T {
  if (!result.ok) throw new Error(`expected success, got ${result.reason}`);
  return result.value;
}

function addBucket(store: LibraryStore, name = "Games"): Bucket {
  const bucket = createBucket({ name, ownerName: "Me" }, ctxFor(name));
  store.addBucket(bucket, { bucketId: bucket.id, ...REF });
  return bucket;
}

describe("a fresh library", () => {
  it("is created and saved on first open", async () => {
    const adapter = createMemoryStorage();
    const store = await open(adapter);
    expect(store.getState().library.profile.displayName).toBe("Me");
    expect(await adapter.read("library")).toBeDefined();
  });

  it("keeps the library it already has", async () => {
    const adapter = createMemoryStorage();
    const first = (await open(adapter)).getState().library.id;
    expect((await open(adapter)).getState().library.id).toBe(first);
  });
});

describe("running core commands inside Automerge", () => {
  it("applies every editing command to a stored document", async () => {
    const store = await open(createMemoryStorage());
    const bucket = addBucket(store);
    const ctx = ctxFor("c");
    const run = <T>(command: (b: Bucket) => CommandResult<T>): T =>
      ok(store.updateBucket(bucket.id, command));
    const a = run((b) => addItem(b, { title: "A" }, ctx));
    const b = run((b2) => addItem(b2, { title: "B" }, ctx));
    const c = run((b3) => addItem(b3, { title: "C" }, ctx));
    const s1 = run((x) => addStep(x, a, "one", ctx));
    run((x) => addStep(x, a, "two", ctx));
    run((x) => addStep(x, a, "three", ctx));
    run((x) => setStepDone(x, a, s1, true, ctx));
    run((x) => setItemNotes(x, a, "hello", ctx));
    const link = run((x) => addLink(x, a, "https://example.com", ctx));
    const image = run((x) =>
      addAttachment(x, a, { blobId: "ab", mime: "image/png", width: 1, height: 1, bytes: 1 }, ctx),
    );
    const steps = () => store.getState().buckets[bucket.id]?.items[a]?.steps.map((s) => s.id) ?? [];
    const [, s2 = "", s3 = ""] = steps();
    run((x) => reorderSteps(x, a, [s3, s1, s2], ctx));
    expect(steps()).toEqual([s3, s1, s2]);
    run((x) => removeStep(x, a, s2, ctx));
    run((x) => removeLink(x, a, link, ctx));
    run((x) => removeAttachment(x, a, image, ctx));
    run((x) => convertItemToStep(x, b, a, ctx));
    run((x) => convertStepToItem(x, a, s3, ctx));
    run((x) => removeItem(x, c, ctx));

    const view = store.getState().buckets[bucket.id];
    expect(view?.itemOrder).toHaveLength(2);
    expect(view?.items[a]).toMatchObject({ notes: "hello", links: [], attachments: [] });
    expect(view?.items[a]?.steps.map((s) => s.title)).toEqual(["one", "B"]);
    expect(view?.items[a]?.steps[0]?.done).toBe(true);
  });

  it("draws, finishes and compacts history inside a stored document", async () => {
    const store = await open(createMemoryStorage());
    const bucket = addBucket(store);
    const ctx = ctxFor("d");
    const item = ok(store.updateBucket(bucket.id, (b) => addItem(b, { title: "A" }, ctx)));
    let n = 0;
    const makeId = () => `e${String(++n)}`;
    const drawn = store.updateBucket(bucket.id, (b) => {
      const result = draw(b, {
        memberId: "me",
        deviceId: "d1",
        now: NOW,
        rng: createSeededRng(1),
        makeId,
      });
      if (!result.ok) return { ok: false, reason: "invalid-order" };
      applyEvents(b, result.events);
      return { ok: true, value: result.itemIds };
    });
    expect(ok(drawn)).toEqual([item]);
    const later = new Date(NOW.getTime() + 400 * 24 * 3_600_000);
    const removed = ok(
      store.updateBucket(bucket.id, (b) => ({
        ok: true,
        value: compactHistory(b, later, duration(30, "days")),
      })),
    );
    expect(removed).toBe(1);
    expect(store.getState().buckets[bucket.id]?.events).toEqual([]);
    expect(store.getState().buckets[bucket.id]?.baseline?.items[item]?.status).toBe("hand");
  });

  it("reports a refusal and changes nothing", async () => {
    const adapter = createMemoryStorage();
    const store = await open(adapter);
    const bucket = addBucket(store);
    await store.flush();
    const before = store.getState();
    const result = store.updateBucket(bucket.id, (b) => addItem(b, { title: " " }, ctxFor()));
    expect(result).toEqual({ ok: false, reason: "empty-title" });
    expect(store.getState()).toBe(before);
  });

  it("refuses an unknown bucket", async () => {
    const store = await open(createMemoryStorage());
    expect(store.updateBucket("nope", (b) => addItem(b, { title: "x" }, ctxFor()))).toEqual({
      ok: false,
      reason: "unknown-bucket",
    });
  });

  it("updates the library", async () => {
    const store = await open(createMemoryStorage());
    addBucket(store, "A");
    addBucket(store, "B");
    const [first = "", second = ""] = store.getState().library.bucketOrder;
    ok(store.updateLibrary((lib) => reorderBuckets(lib, [second, first])));
    expect(store.getState().library.bucketOrder).toEqual([second, first]);
  });

  it("merges edits made on two devices", async () => {
    const store = await open(createMemoryStorage());
    const bucket = addBucket(store);
    const id = ok(store.updateBucket(bucket.id, (b) => addItem(b, { title: "A" }, ctxFor("x"))));
    await store.flush();
    const base = Automerge.from(
      store.getState().buckets[bucket.id] as unknown as Record<string, unknown>,
    );
    const one = Automerge.change(Automerge.clone(base), (d) => {
      ok(setItemNotes(d as unknown as Bucket, id, "from one", ctxFor("o")));
    });
    const two = Automerge.change(Automerge.clone(base), (d) => {
      ok(addItem(d as unknown as Bucket, { title: "B" }, ctxFor("t")));
    });
    const merged = Automerge.toJS(Automerge.merge(one, two)) as unknown as Bucket;
    expect(merged.items[id]?.notes).toBe("from one");
    expect(merged.itemOrder).toHaveLength(2);
  });
});

describe("state for the UI", () => {
  it("keeps the same state object until something changes, then makes a new one", async () => {
    const store = await open(createMemoryStorage());
    const first = store.getState();
    expect(store.getState()).toBe(first);
    const listener = vi.fn();
    const stop = store.subscribe(listener);
    const bucket = addBucket(store);
    expect(listener).toHaveBeenCalledTimes(1);
    const second = store.getState();
    expect(second).not.toBe(first);
    expect(second.buckets[bucket.id]?.name).toBe("Games");
    stop();
    addBucket(store, "More");
    expect(listener).toHaveBeenCalledTimes(1);
  });

  it("reuses the view of buckets that did not change", async () => {
    const store = await open(createMemoryStorage());
    const a = addBucket(store, "A");
    const b = addBucket(store, "B");
    const before = store.getState().buckets;
    ok(store.updateBucket(a.id, (x) => addItem(x, { title: "t" }, ctxFor())));
    const after = store.getState().buckets;
    expect(after[b.id]).toBe(before[b.id]);
    expect(after[a.id]).not.toBe(before[a.id]);
  });
});

describe("saving", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it("waits for a quiet moment, then saves once", async () => {
    const adapter = createMemoryStorage();
    const write = vi.spyOn(adapter, "write");
    const store = await open(adapter, 300);
    write.mockClear();
    const bucket = addBucket(store);
    for (let i = 0; i < 5; i++)
      ok(
        store.updateBucket(bucket.id, (b) =>
          addItem(b, { title: `t${String(i)}` }, ctxFor(`k${String(i)}`)),
        ),
      );
    await vi.advanceTimersByTimeAsync(299);
    expect(write).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(2);
    expect(write.mock.calls.map(([key]) => key).sort()).toEqual([
      `buckets/${bucket.id}`,
      "library",
    ]);
  });

  it("saves immediately on flush and survives a reopen", async () => {
    const adapter = createMemoryStorage();
    const store = await open(adapter);
    const bucket = addBucket(store);
    ok(store.updateBucket(bucket.id, (b) => addItem(b, { title: "Kept" }, ctxFor())));
    await store.flush();
    const reopened = await open(adapter);
    const titles = Object.values(reopened.getState().buckets[bucket.id]?.items ?? {}).map(
      (i) => i.title,
    );
    expect(titles).toEqual(["Kept"]);
    expect(reopened.getState().library.bucketOrder).toEqual([bucket.id]);
  });

  it("reports a failed save, keeps the change, and retries", async () => {
    const adapter = createMemoryStorage();
    const store = await open(adapter);
    const bucket = addBucket(store);
    await store.flush();
    const realWrite = adapter.write.bind(adapter);
    let failing = true;
    adapter.write = (key, bytes) =>
      failing ? Promise.reject(new Error("disk full")) : realWrite(key, bytes);
    ok(store.updateBucket(bucket.id, (b) => addItem(b, { title: "X" }, ctxFor())));
    await expect(store.flush()).rejects.toThrow("disk full");
    expect(store.getState().saveError).toBe("disk full");
    failing = false;
    await store.flush();
    expect(store.getState().saveError).toBeUndefined();
    const reopened = await open(adapter);
    expect(Object.keys(reopened.getState().buckets[bucket.id]?.items ?? {})).toHaveLength(1);
  });
});

describe("removing a bucket", () => {
  it("drops the pointer and deletes the document", async () => {
    const adapter = createMemoryStorage();
    const store = await open(adapter);
    const bucket = addBucket(store);
    await store.flush();
    expect(await store.removeBucket(bucket.id)).toEqual({ ok: true, value: undefined });
    expect(store.getState().buckets[bucket.id]).toBeUndefined();
    expect(await adapter.read(`buckets/${bucket.id}`)).toBeUndefined();
    expect((await open(adapter)).getState().library.bucketOrder).toEqual([]);
    expect(await store.removeBucket(bucket.id)).toEqual({ ok: false, reason: "unknown-bucket" });
  });
});

describe("opening damaged or newer documents", () => {
  const withBucketFile = async (mutate: (bytes: Uint8Array) => Uint8Array | undefined) => {
    const adapter = createMemoryStorage();
    const store = await open(adapter);
    const bucket = addBucket(store);
    await store.flush();
    const original = await adapter.read(`buckets/${bucket.id}`);
    const next = mutate(original ?? new Uint8Array());
    if (next === undefined) await adapter.remove(`buckets/${bucket.id}`);
    else await adapter.write(`buckets/${bucket.id}`, next);
    return { adapter, bucket, next };
  };

  it("leaves a bucket from a newer version alone and says so", async () => {
    const newer = Automerge.save(
      Automerge.from({
        ...createBucket({ name: "x", ownerName: "Me" }, ctxFor()),
        schemaVersion: 99,
      }),
    );
    const { adapter, bucket } = await withBucketFile(() => newer);
    const store = await open(adapter);
    expect(store.getState().problems).toEqual([
      { key: `buckets/${bucket.id}`, kind: "newer-version" },
    ]);
    expect(store.getState().buckets).toEqual({});
    await store.flush();
    expect(await adapter.read(`buckets/${bucket.id}`)).toEqual(newer);
  });

  it("reports an unreadable bucket", async () => {
    const { adapter, bucket } = await withBucketFile(() => new Uint8Array([1, 2, 3]));
    expect((await open(adapter)).getState().problems).toEqual([
      { key: `buckets/${bucket.id}`, kind: "unreadable" },
    ]);
  });

  it("reports a bucket whose file is gone", async () => {
    const { adapter, bucket } = await withBucketFile(() => undefined);
    expect((await open(adapter)).getState().problems).toEqual([
      { key: `buckets/${bucket.id}`, kind: "missing" },
    ]);
  });

  it("refuses a library from a newer version or one it cannot read", async () => {
    const adapter = createMemoryStorage();
    await adapter.write(
      "library",
      Automerge.save(Automerge.from({ ...createLibrary("Me", ctxFor()), schemaVersion: 99 })),
    );
    const newer = await openLibraryStore(adapter, {
      newLibrary: () => createLibrary("Me", ctxFor()),
    });
    expect(newer).toEqual({ ok: false, problem: { key: "library", kind: "newer-version" } });
    await adapter.write("library", new Uint8Array([9, 9]));
    const broken = await openLibraryStore(adapter, {
      newLibrary: () => createLibrary("Me", ctxFor()),
    });
    expect(broken).toEqual({ ok: false, problem: { key: "library", kind: "unreadable" } });
  });
});

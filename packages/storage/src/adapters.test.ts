// SPDX-License-Identifier: Apache-2.0

import "fake-indexeddb/auto";
import { IDBFactory } from "fake-indexeddb";
import { describe, expect, it, vi } from "vitest";
import { assertValidKey, isValidKey, type StorageAdapter } from "./adapter";
import { createBlobStore, findUnreferencedBlobIds, sha256Hex } from "./blobs";
import { createIndexedDbStorage } from "./indexeddb";
import { createMemoryStorage } from "./memory";
import { createSettingsStore } from "./settings";
import { createTauriStorage, type InvokeFn } from "./tauri";

const bytes = (...n: number[]): Uint8Array => new Uint8Array(n);

/** A fake of the Rust commands, with the same behavior the real ones promise. */
function fakeRust(): { invoke: InvokeFn; files: Map<string, Uint8Array> } {
  const files = new Map<string, Uint8Array>();
  const invoke: InvokeFn = (command, args, options) => {
    if (command === "storage_write" && args instanceof Uint8Array) {
      files.set(options?.headers["x-storage-key"] ?? "", args.slice());
      return Promise.resolve(null);
    }
    const a = (args ?? {}) as { key?: string; prefix?: string };
    if (command === "storage_read") {
      const value = files.get(a.key ?? "");
      return value
        ? Promise.resolve(value.buffer.slice(0))
        : Promise.reject(Object.assign(new Error("not found"), { kind: "not-found" }));
    }
    if (command === "storage_list")
      return Promise.resolve(
        [...files.keys()].filter(
          (k) =>
            k.startsWith(`${a.prefix ?? ""}/`) &&
            !k.slice((a.prefix ?? "").length + 1).includes("/"),
        ),
      );
    if (command === "storage_remove") {
      files.delete(a.key ?? "");
      return Promise.resolve(null);
    }
    return Promise.reject(new Error(`unknown command ${command}`));
  };
  return { invoke, files };
}

const adapters: [string, () => StorageAdapter][] = [
  ["memory", createMemoryStorage],
  ["IndexedDB", () => createIndexedDbStorage(new IDBFactory(), "t")],
  ["Tauri", () => createTauriStorage(fakeRust().invoke)],
];

describe.each(adapters)("%s storage", (_name, make) => {
  it("reads back what it wrote, and nothing for a missing key", async () => {
    const s = make();
    expect(await s.read("buckets/a")).toBeUndefined();
    await s.write("buckets/a", bytes(1, 2, 3));
    expect(await s.read("buckets/a")).toEqual(bytes(1, 2, 3));
  });

  it("replaces a value completely", async () => {
    const s = make();
    await s.write("library", bytes(1, 2, 3, 4));
    await s.write("library", bytes(9));
    expect(await s.read("library")).toEqual(bytes(9));
  });

  it("is not affected by later changes to the bytes passed in", async () => {
    const s = make();
    const input = bytes(1, 2);
    await s.write("library", input);
    input[0] = 99;
    expect(await s.read("library")).toEqual(bytes(1, 2));
  });

  it("lists only keys directly under a prefix", async () => {
    const s = make();
    await s.write("buckets/a", bytes(1));
    await s.write("buckets/b", bytes(1));
    await s.write("blobs/c", bytes(1));
    await s.write("library", bytes(1));
    expect((await s.list("buckets")).sort()).toEqual(["buckets/a", "buckets/b"]);
    expect(await s.list("nothing")).toEqual([]);
  });

  it("removes values, and removing a missing key is fine", async () => {
    const s = make();
    await s.write("buckets/a", bytes(1));
    await s.remove("buckets/a");
    await s.remove("buckets/a");
    expect(await s.read("buckets/a")).toBeUndefined();
  });

  it.each(["../x", "/abs", "a//b", "", ".hidden", "a b", "a/b/c/d/e", "x".repeat(200)])(
    "rejects the unsafe key %j",
    async (key) => {
      const s = make();
      await expect(s.read(key)).rejects.toThrow(RangeError);
      await expect(s.write(key, bytes(1))).rejects.toThrow(RangeError);
    },
  );
});

describe("IndexedDB storage", () => {
  it("keeps data across connections to the same database", async () => {
    const factory = new IDBFactory();
    await createIndexedDbStorage(factory, "x").write("library", bytes(5));
    expect(await createIndexedDbStorage(factory, "x").read("library")).toEqual(bytes(5));
  });

  it("surfaces a failure to open", async () => {
    const broken = {
      open() {
        const req: { onerror?: () => void; error: Error } = { error: new Error("blocked") };
        queueMicrotask(() => req.onerror?.());
        return req;
      },
    } as unknown as IDBFactory;
    await expect(createIndexedDbStorage(broken).read("library")).rejects.toThrow("blocked");
  });
});

describe("Tauri storage", () => {
  it("passes the key in a header and the bytes raw", async () => {
    const invoke = vi.fn<InvokeFn>(() => Promise.resolve(null));
    await createTauriStorage(invoke).write("buckets/a", bytes(1));
    expect(invoke).toHaveBeenCalledWith("storage_write", bytes(1), {
      headers: { "x-storage-key": "buckets/a" },
    });
  });

  it("passes other errors through", async () => {
    const s = createTauriStorage(() => Promise.reject(new Error("io")));
    await expect(s.read("library")).rejects.toThrow("io");
  });

  it("accepts bytes in either form and refuses anything else", async () => {
    expect(await createTauriStorage(() => Promise.resolve(bytes(1))).read("library")).toEqual(
      bytes(1),
    );
    await expect(createTauriStorage(() => Promise.resolve("text")).read("library")).rejects.toThrow(
      "bytes",
    );
    await expect(createTauriStorage(() => Promise.resolve([1])).list("buckets")).rejects.toThrow(
      "keys",
    );
  });
});

describe("keys", () => {
  it("accepts ids, hashes and dotted names", () => {
    for (const key of [
      "library",
      "buckets/3f2a-9",
      "blobs/" + "a".repeat(64),
      "settings/pane.sidebar",
    ])
      expect(isValidKey(key)).toBe(true);
    expect(() => {
      assertValidKey("fine");
    }).not.toThrow();
  });
});

describe("blobs", () => {
  it("names bytes by their SHA-256 and stores them once", async () => {
    const adapter = createMemoryStorage();
    const blobs = createBlobStore(adapter);
    const write = vi.spyOn(adapter, "write");
    const id = await blobs.put(new TextEncoder().encode("abc"));
    expect(id).toBe("ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad");
    expect(await blobs.put(new TextEncoder().encode("abc"))).toBe(id);
    expect(write).toHaveBeenCalledTimes(1);
    expect(await blobs.has(id)).toBe(true);
    expect(await blobs.has("0".repeat(64))).toBe(false);
    expect(await blobs.get(id)).toEqual(new TextEncoder().encode("abc"));
    expect(await blobs.list()).toEqual([id]);
    expect(await sha256Hex(new Uint8Array())).toBe(
      "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855",
    );
  });

  it("finds blobs nothing refers to", () => {
    const bucket = {
      items: {
        a: { attachments: [{ blobId: "keep" }] },
        b: { attachments: [] },
      },
    } as never;
    expect(findUnreferencedBlobIds(["keep", "lost"], [bucket])).toEqual(["lost"]);
  });
});

describe("settings", () => {
  it("stores JSON values and returns undefined for unset or damaged ones", async () => {
    const adapter = createMemoryStorage();
    const settings = createSettingsStore(adapter);
    expect(await settings.get("pane")).toBeUndefined();
    await settings.set("pane", { sidebar: 232 });
    expect(await settings.get("pane")).toEqual({ sidebar: 232 });
    await adapter.write("settings/pane", new TextEncoder().encode("{oops"));
    expect(await settings.get("pane")).toBeUndefined();
  });
});

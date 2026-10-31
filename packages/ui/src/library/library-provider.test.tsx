// SPDX-License-Identifier: Apache-2.0

import { addItem, createBucket, createLibrary } from "@buckets/core";
import { createMemoryStorage, openLibraryStore, type LibraryStore } from "@buckets/storage";
import { act, render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { LibraryProvider, useBucket, useLibrary, useLibraryStore } from "./library-provider";

const NOW = new Date("2026-10-30T09:00:00Z");
let n = 0;
const ctx = () => ({ memberId: "me", now: NOW, makeId: () => `id-${String(++n)}` });

async function openStore(): Promise<LibraryStore> {
  const result = await openLibraryStore(createMemoryStorage(), {
    newLibrary: () => createLibrary("Me", ctx()),
    saveDelayMs: 1_000_000,
  });
  if (!result.ok) throw new Error("could not open");
  return result.store;
}

function Names({ bucketId }: { bucketId: string }): React.ReactElement {
  const { library } = useLibrary();
  const bucket = useBucket(bucketId);
  return (
    <p>
      {library.bucketOrder.length} buckets;{" "}
      {bucket ? `${bucket.name} has ${String(Object.keys(bucket.items).length)}` : "none"}
    </p>
  );
}

describe("LibraryProvider", () => {
  it("shows the library and re-renders when a bucket changes", async () => {
    const store = await openStore();
    const bucket = createBucket({ name: "Games", ownerName: "Me" }, ctx());
    render(
      <LibraryProvider store={store}>
        <Names bucketId={bucket.id} />
      </LibraryProvider>,
    );
    expect(screen.getByText("0 buckets; none")).toBeTruthy();
    act(() => {
      store.addBucket(bucket, {
        bucketId: bucket.id,
        keyId: "k",
        role: "owner",
        addedAt: NOW.toISOString(),
      });
    });
    expect(screen.getByText("1 buckets; Games has 0")).toBeTruthy();
    act(() => {
      store.updateBucket(bucket.id, (b) => addItem(b, { title: "Hades" }, ctx()));
    });
    expect(screen.getByText("1 buckets; Games has 1")).toBeTruthy();
  });

  it("gives components the store to run commands on", async () => {
    const store = await openStore();
    function Grab(): React.ReactElement {
      return <p>{useLibraryStore() === store ? "same store" : "other store"}</p>;
    }
    render(
      <LibraryProvider store={store}>
        <Grab />
      </LibraryProvider>,
    );
    expect(screen.getByText("same store")).toBeTruthy();
  });

  it("returns no bucket when none is asked for", async () => {
    const store = await openStore();
    function Probe(): React.ReactElement {
      return <p>{useBucket(undefined) === undefined ? "no bucket" : "a bucket"}</p>;
    }
    render(
      <LibraryProvider store={store}>
        <Probe />
      </LibraryProvider>,
    );
    expect(screen.getByText("no bucket")).toBeTruthy();
  });

  it("fails loudly without a provider", () => {
    function Bad(): null {
      useLibraryStore();
      return null;
    }
    const quiet = console.error;
    console.error = () => undefined;
    expect(() => render(<Bad />)).toThrow("LibraryProvider");
    console.error = quiet;
  });
});

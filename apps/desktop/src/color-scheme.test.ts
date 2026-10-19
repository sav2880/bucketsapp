// SPDX-License-Identifier: Apache-2.0

import { describe, expect, it } from "vitest";
import { createSchemeStore, type DarkQuery } from "./color-scheme";

/** A fake media query whose value and listeners the test controls. */
function fakeQuery(
  initial: boolean,
): DarkQuery & { set: (value: boolean) => void; count: () => number } {
  const listeners = new Set<() => void>();
  const query = {
    matches: initial,
    addEventListener: (_type: "change", listener: () => void): void => {
      listeners.add(listener);
    },
    removeEventListener: (_type: "change", listener: () => void): void => {
      listeners.delete(listener);
    },
    set: (value: boolean): void => {
      query.matches = value;
      listeners.forEach((listener) => {
        listener();
      });
    },
    count: (): number => listeners.size,
  };
  return query;
}

describe("createSchemeStore", () => {
  it("reports dark or light from the query", () => {
    expect(createSchemeStore(fakeQuery(true)).getSnapshot()).toBe("dark");
    expect(createSchemeStore(fakeQuery(false)).getSnapshot()).toBe("light");
  });

  it("notifies subscribers when the system setting changes", () => {
    const query = fakeQuery(false);
    const store = createSchemeStore(query);
    let calls = 0;
    store.subscribe(() => {
      calls += 1;
    });
    query.set(true);
    expect(calls).toBe(1);
    expect(store.getSnapshot()).toBe("dark");
  });

  it("stops notifying after unsubscribe", () => {
    const query = fakeQuery(false);
    const unsubscribe = createSchemeStore(query).subscribe(() => undefined);
    expect(query.count()).toBe(1);
    unsubscribe();
    expect(query.count()).toBe(0);
  });
});

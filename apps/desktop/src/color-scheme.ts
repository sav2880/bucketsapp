// SPDX-License-Identifier: Apache-2.0

/** The part of `MediaQueryList` we use, so tests can pass a fake. */
export interface DarkQuery {
  /** True while the system is in dark mode. */
  matches: boolean;
  /** Registers a listener for changes. */
  addEventListener: (type: "change", listener: () => void) => void;
  /** Removes a listener. */
  removeEventListener: (type: "change", listener: () => void) => void;
}

/**
 * Creates the pair of functions React's `useSyncExternalStore` needs for a media query.
 * @param query - The `(prefers-color-scheme: dark)` media query list.
 * @returns `subscribe` and `getSnapshot` for that query.
 */
export function createSchemeStore(query: DarkQuery): {
  subscribe: (onChange: () => void) => () => void;
  getSnapshot: () => "light" | "dark";
} {
  return {
    subscribe: (onChange) => {
      query.addEventListener("change", onChange);
      return () => {
        query.removeEventListener("change", onChange);
      };
    },
    getSnapshot: () => (query.matches ? "dark" : "light"),
  };
}

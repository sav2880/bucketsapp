// SPDX-License-Identifier: Apache-2.0

import type { Bucket } from "@buckets/core";
import type { LibraryState, LibraryStore } from "@buckets/storage";
import {
  createContext,
  useCallback,
  useContext,
  useSyncExternalStore,
  type ReactElement,
  type ReactNode,
} from "react";

const LibraryContext = createContext<LibraryStore | undefined>(undefined);

/** Props for {@link LibraryProvider}. */
export interface LibraryProviderProps {
  /** The opened store. The app creates it with `openLibraryStore` and the right storage adapter. */
  store: LibraryStore;
  /** What to render. */
  children: ReactNode;
}

/**
 * Makes the user's library available to every component below, so the UI never touches
 * platform storage itself (AGENTS.md §2).
 *
 * @param props - See {@link LibraryProviderProps}.
 * @returns The provider.
 */
export function LibraryProvider({ store, children }: LibraryProviderProps): ReactElement {
  return <LibraryContext value={store}>{children}</LibraryContext>;
}

/**
 * Gets the store, for running commands (`store.updateBucket(id, (b) => addItem(b, …))`).
 *
 * @returns The store.
 * @throws When used outside a {@link LibraryProvider}; that is a programmer error.
 */
export function useLibraryStore(): LibraryStore {
  const store = useContext(LibraryContext);
  if (store === undefined) throw new Error("useLibraryStore needs a LibraryProvider above it");
  return store;
}

/**
 * Reads the library state and re-renders when it changes.
 *
 * @returns The current state.
 */
export function useLibrary(): LibraryState {
  const store = useLibraryStore();
  // Wrapped so the store's methods keep their `this`; `store` is stable, so these are too.
  const subscribe = useCallback((listener: () => void) => store.subscribe(listener), [store]);
  const getState = useCallback(() => store.getState(), [store]);
  return useSyncExternalStore(subscribe, getState);
}

/**
 * Reads one bucket and re-renders when it changes.
 *
 * @param bucketId - The bucket, or `undefined` for none.
 * @returns The bucket, or `undefined` when there is none or it could not be opened.
 */
export function useBucket(bucketId: string | undefined): Bucket | undefined {
  const { buckets } = useLibrary();
  return bucketId === undefined ? undefined : buckets[bucketId];
}

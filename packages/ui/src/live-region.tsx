// SPDX-License-Identifier: Apache-2.0

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactElement,
  type ReactNode,
} from "react";

/** Says something to screen readers without showing it. */
export type Announce = (message: string) => void;

const LiveRegionContext = createContext<Announce>(() => undefined);

/** Props for {@link LiveRegionProvider}. */
export interface LiveRegionProviderProps {
  /** What to render. */
  children: ReactNode;
}

/** Wait between clearing and filling the region, so the same message twice is read twice. */
const REFILL_DELAY_MS = 50;

/**
 * Provides the one shared live region and renders it. Draw results, errors and other
 * changes that are not obvious from focus are announced through it (AGENTS.md §7).
 *
 * @param props - See {@link LiveRegionProviderProps}.
 * @returns The provider and its hidden region.
 */
export function LiveRegionProvider({ children }: LiveRegionProviderProps): ReactElement {
  const [message, setMessage] = useState("");
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  useEffect(
    () => () => {
      clearTimeout(timer.current);
    },
    [],
  );

  const announce = useCallback<Announce>((next) => {
    // Clear first: screen readers ignore a region whose text did not change.
    setMessage("");
    clearTimeout(timer.current);
    timer.current = setTimeout(() => {
      setMessage(next);
    }, REFILL_DELAY_MS);
  }, []);
  const value = useMemo(() => announce, [announce]);

  return (
    <LiveRegionContext value={value}>
      {children}
      <div
        className="sr-only"
        role="status"
        aria-live="polite"
        aria-atomic="true"
        data-testid="live-region"
      >
        {message}
      </div>
    </LiveRegionContext>
  );
}

/**
 * Gets the function that announces a message to screen readers.
 *
 * @returns {@link Announce}; does nothing outside a {@link LiveRegionProvider}.
 */
export function useAnnounce(): Announce {
  return useContext(LiveRegionContext);
}

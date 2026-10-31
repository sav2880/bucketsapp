// SPDX-License-Identifier: Apache-2.0

import {
  createContext,
  useContext,
  useSyncExternalStore,
  type ReactElement,
  type ReactNode,
} from "react";

/** The user's in-app choice: follow the system, always cut motion, or always allow it. */
export type MotionSetting = "system" | "reduce" | "allow";

const MotionSettingContext = createContext<MotionSetting>("system");

/** Props for {@link MotionSettingProvider}. */
export interface MotionSettingProviderProps {
  /** The in-app setting. */
  setting: MotionSetting;
  /** What to render. */
  children: ReactNode;
}

/**
 * Makes the in-app motion setting available to {@link useMotionPreference}.
 *
 * @param props - See {@link MotionSettingProviderProps}.
 * @returns The provider.
 */
export function MotionSettingProvider({
  setting,
  children,
}: MotionSettingProviderProps): ReactElement {
  return <MotionSettingContext value={setting}>{children}</MotionSettingContext>;
}

const QUERY = "(prefers-reduced-motion: reduce)";

function subscribe(onChange: () => void): () => void {
  if (typeof window.matchMedia !== "function") return () => undefined;
  const query = window.matchMedia(QUERY);
  query.addEventListener("change", onChange);
  return () => {
    query.removeEventListener("change", onChange);
  };
}

function systemPrefersReduced(): boolean {
  return typeof window.matchMedia === "function" && window.matchMedia(QUERY).matches;
}

/**
 * Whether animations should be cut back. Every animation checks this (AGENTS.md §7).
 *
 * The system's "reduce motion" setting applies unless the user chose otherwise in the app.
 *
 * @returns `true` when motion should be reduced.
 */
export function useMotionPreference(): boolean {
  const setting = useContext(MotionSettingContext);
  const system = useSyncExternalStore(subscribe, systemPrefersReduced, () => false);
  if (setting === "reduce") return true;
  if (setting === "allow") return false;
  return system;
}

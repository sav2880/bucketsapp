// SPDX-License-Identifier: Apache-2.0

import { createContext, useContext, type ReactElement, type ReactNode } from "react";
import { detectPlatform, type Platform } from "./platform";

const PlatformContext = createContext<Platform | undefined>(undefined);

/** Props for {@link PlatformProvider}. */
export interface PlatformProviderProps {
  /** The platform to use instead of detecting it; tests and previews pass one. */
  platform: Platform;
  /** What to render. */
  children: ReactNode;
}

/**
 * Overrides the detected platform for everything below.
 *
 * @param props - See {@link PlatformProviderProps}.
 * @returns The provider.
 */
export function PlatformProvider({ platform, children }: PlatformProviderProps): ReactElement {
  return <PlatformContext value={platform}>{children}</PlatformContext>;
}

/**
 * The platform the app runs on. The one place platform differences come from (AGENTS.md §7).
 *
 * @returns The operating system and the label of the main shortcut key.
 */
export function usePlatform(): Platform {
  const provided = useContext(PlatformContext);
  return provided ?? detectPlatform(navigator);
}

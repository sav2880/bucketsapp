// SPDX-License-Identifier: Apache-2.0

import { useSyncExternalStore } from "react";

function subscribe(onChange: () => void): () => void {
  window.addEventListener("resize", onChange);
  return () => {
    window.removeEventListener("resize", onChange);
  };
}

/**
 * The width of the window in pixels, updated as it is resized. Used to pick the layout
 * (plan.md §12.2).
 *
 * @returns Width in CSS pixels.
 */
export function useViewportWidth(): number {
  return useSyncExternalStore(
    subscribe,
    () => window.innerWidth,
    () => 1200,
  );
}

/** Below this width the details pane becomes a sheet. */
export const INSPECTOR_SHEET_BELOW = 900;
/** Below this width the sidebar becomes a drawer. */
export const SIDEBAR_DRAWER_BELOW = 600;

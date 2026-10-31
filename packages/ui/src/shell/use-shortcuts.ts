// SPDX-License-Identifier: Apache-2.0

import { useEffect, useRef } from "react";
import { usePlatform } from "../hooks/use-platform";

/** Shortcut text such as `"mod+shift+n"` mapped to what it does. A missing action turns the shortcut off. */
export type ShortcutBindings = Readonly<Record<string, (() => void) | undefined>>;

const KEY_NAMES: Record<string, string> = { ",": "comma", " ": "space" };

/**
 * Describes a key press the way {@link ShortcutBindings} names it.
 *
 * @param event - The key event.
 * @param mac - Whether the main modifier is ⌘ (otherwise Ctrl).
 * @returns For example `"mod+shift+n"`, or `undefined` when the main modifier isn't held.
 */
export function shortcutOf(event: KeyboardEvent, mac: boolean): string | undefined {
  if (!(mac ? event.metaKey : event.ctrlKey)) return undefined;
  const key = event.key.toLowerCase();
  const parts = ["mod"];
  if (event.altKey) parts.push("alt");
  if (event.shiftKey) parts.push("shift");
  parts.push(KEY_NAMES[key] ?? key);
  // "mod+alt+shift+x" and "mod+shift+x" read in a fixed order so bindings are easy to write.
  return parts.join("+");
}

/**
 * Runs actions for keyboard shortcuts while the component is mounted. ⌘ on macOS, Ctrl
 * elsewhere (AGENTS.md §7).
 *
 * @param bindings - Shortcut to action. May change on every render.
 */
export function useShortcuts(bindings: ShortcutBindings): void {
  const platform = usePlatform();
  const latest = useRef(bindings);
  useEffect(() => {
    latest.current = bindings;
  });
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent): void => {
      const shortcut = shortcutOf(event, platform.os === "mac");
      const action = shortcut === undefined ? undefined : latest.current[shortcut];
      if (action === undefined) return;
      event.preventDefault();
      action();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [platform.os]);
}

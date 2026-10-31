// SPDX-License-Identifier: Apache-2.0

/** Operating systems the design adapts to. */
export type Os = "mac" | "windows" | "linux" | "other";

/** What components need to know about the platform. */
export interface Platform {
  /** The operating system. */
  os: Os;
  /** Label of the main shortcut key: `⌘` on macOS, `Ctrl` elsewhere. */
  modKey: "⌘" | "Ctrl";
}

/** The parts of `navigator` that tell the platform apart. */
export interface NavigatorLike {
  /** Newer browsers and webviews. */
  userAgentData?: { platform?: string } | undefined;
  /** Older but widely available. */
  platform?: string | undefined;
}

/**
 * Works out the platform from `navigator`. Components never read the user agent themselves
 * (AGENTS.md §7); they ask {@link usePlatform}.
 *
 * @param nav - The browser's `navigator`, or a stand-in.
 * @returns The platform.
 */
export function detectPlatform(nav: NavigatorLike): Platform {
  const name = (nav.userAgentData?.platform ?? nav.platform ?? "").toLowerCase();
  const os: Os =
    name.includes("mac") || name.includes("iphone") || name.includes("ipad")
      ? "mac"
      : name.includes("win")
        ? "windows"
        : name.includes("linux") || name.includes("x11")
          ? "linux"
          : "other";
  return { os, modKey: os === "mac" ? "⌘" : "Ctrl" };
}

/**
 * Writes a shortcut the way the platform does.
 *
 * @param shortcut - Keys joined by `+`, using `mod`, `shift`, `alt` and a final key, for
 *   example `"mod+shift+n"`.
 * @param platform - Which platform to write for.
 * @returns `⇧⌘N` on macOS, `Ctrl+Shift+N` elsewhere.
 */
export function formatShortcut(shortcut: string, platform: Platform): string {
  const parts = shortcut.toLowerCase().split("+");
  const key = parts.pop() ?? "";
  const label =
    {
      enter: "↩",
      backspace: "⌫",
      delete: "⌦",
      up: "↑",
      down: "↓",
      left: "←",
      right: "→",
      comma: ",",
    }[key] ?? key.toUpperCase();
  if (platform.os === "mac") {
    const marks = { alt: "⌥", shift: "⇧", mod: "⌘" };
    // macOS order: ⌃ ⌥ ⇧ ⌘ then the key.
    return (
      (["alt", "shift", "mod"] as const)
        .filter((m) => parts.includes(m))
        .map((m) => marks[m])
        .join("") + label
    );
  }
  const names = { mod: "Ctrl", shift: "Shift", alt: "Alt" };
  return [
    ...(["mod", "alt", "shift"] as const).filter((m) => parts.includes(m)).map((m) => names[m]),
    label,
  ].join("+");
}

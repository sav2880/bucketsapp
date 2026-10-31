// SPDX-License-Identifier: Apache-2.0

import { describe, expect, it } from "vitest";
import { detectPlatform, formatShortcut } from "./platform";

describe("detectPlatform", () => {
  it.each([
    [{ platform: "MacIntel" }, "mac", "⌘"],
    [{ userAgentData: { platform: "macOS" }, platform: "x" }, "mac", "⌘"],
    [{ platform: "Win32" }, "windows", "Ctrl"],
    [{ platform: "Linux x86_64" }, "linux", "Ctrl"],
    [{ platform: "X11" }, "linux", "Ctrl"],
    [{}, "other", "Ctrl"],
  ] as const)("reads %j", (nav, os, modKey) => {
    expect(detectPlatform(nav)).toEqual({ os, modKey });
  });
});

describe("formatShortcut", () => {
  const mac = detectPlatform({ platform: "MacIntel" });
  const win = detectPlatform({ platform: "Win32" });

  it("writes macOS symbols in macOS order", () => {
    expect(formatShortcut("mod+n", mac)).toBe("⌘N");
    expect(formatShortcut("mod+shift+n", mac)).toBe("⇧⌘N");
    expect(formatShortcut("mod+alt+up", mac)).toBe("⌥⌘↑");
    expect(formatShortcut("mod+backspace", mac)).toBe("⌘⌫");
    expect(formatShortcut("mod+enter", mac)).toBe("⌘↩");
  });

  it("writes names joined by plus elsewhere", () => {
    expect(formatShortcut("mod+d", win)).toBe("Ctrl+D");
    expect(formatShortcut("mod+shift+n", win)).toBe("Ctrl+Shift+N");
    expect(formatShortcut("alt+down", win)).toBe("Alt+↓");
    expect(formatShortcut("mod+comma", win)).toBe("Ctrl+,");
  });
});

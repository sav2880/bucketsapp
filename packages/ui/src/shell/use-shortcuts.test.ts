// SPDX-License-Identifier: Apache-2.0

import { describe, expect, it } from "vitest";
import { shortcutOf } from "./use-shortcuts";

const press = (key: string, init: KeyboardEventInit = {}): KeyboardEvent =>
  new KeyboardEvent("keydown", { key, ...init });

describe("shortcutOf", () => {
  it("needs the main modifier: Command on macOS, Control elsewhere", () => {
    expect(shortcutOf(press("d", { metaKey: true }), true)).toBe("mod+d");
    expect(shortcutOf(press("d", { ctrlKey: true }), true)).toBeUndefined();
    expect(shortcutOf(press("d", { ctrlKey: true }), false)).toBe("mod+d");
    expect(shortcutOf(press("d", { metaKey: true }), false)).toBeUndefined();
    expect(shortcutOf(press("d"), false)).toBeUndefined();
  });

  it("names extra modifiers and special keys", () => {
    expect(shortcutOf(press("N", { ctrlKey: true, shiftKey: true }), false)).toBe("mod+shift+n");
    expect(shortcutOf(press("ArrowUp", { ctrlKey: true, altKey: true }), false)).toBe(
      "mod+alt+arrowup",
    );
    expect(shortcutOf(press(",", { ctrlKey: true }), false)).toBe("mod+comma");
    expect(shortcutOf(press("Enter", { ctrlKey: true }), false)).toBe("mod+enter");
  });
});

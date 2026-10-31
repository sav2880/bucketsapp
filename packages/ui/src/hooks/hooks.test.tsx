// SPDX-License-Identifier: Apache-2.0

import { act, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  MotionSettingProvider,
  useMotionPreference,
  type MotionSetting,
} from "./use-motion-preference";
import { PlatformProvider, usePlatform } from "./use-platform";

function stubMotionQuery(reduce: boolean): { flip: () => void } {
  const listeners = new Set<() => void>();
  const query = {
    matches: reduce,
    addEventListener: (_: string, l: () => void) => listeners.add(l),
    removeEventListener: (_: string, l: () => void) => listeners.delete(l),
  };
  vi.stubGlobal("matchMedia", () => query);
  return {
    flip: () => {
      query.matches = !query.matches;
      listeners.forEach((l) => {
        l();
      });
    },
  };
}

function Motion(): React.ReactElement {
  return <p>{useMotionPreference() ? "reduced" : "full"}</p>;
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("useMotionPreference", () => {
  it("follows the system setting and reacts when it changes", () => {
    const system = stubMotionQuery(false);
    render(<Motion />);
    expect(screen.getByText("full")).toBeTruthy();
    act(() => {
      system.flip();
    });
    expect(screen.getByText("reduced")).toBeTruthy();
  });

  it.each([
    ["reduce", false, "reduced"],
    ["allow", true, "full"],
    ["system", true, "reduced"],
  ] as [MotionSetting, boolean, string][])(
    "with the app setting %s",
    (setting, system, expected) => {
      stubMotionQuery(system);
      render(
        <MotionSettingProvider setting={setting}>
          <Motion />
        </MotionSettingProvider>,
      );
      expect(screen.getByText(expected)).toBeTruthy();
    },
  );

  it("allows motion when the browser can't say", () => {
    vi.stubGlobal("matchMedia", undefined);
    render(<Motion />);
    expect(screen.getByText("full")).toBeTruthy();
  });
});

describe("usePlatform", () => {
  function Mod(): React.ReactElement {
    const p = usePlatform();
    return <p>{`${p.os} ${p.modKey}`}</p>;
  }

  it("uses the provided platform", () => {
    render(
      <PlatformProvider platform={{ os: "mac", modKey: "⌘" }}>
        <Mod />
      </PlatformProvider>,
    );
    expect(screen.getByText("mac ⌘")).toBeTruthy();
  });

  it("detects the platform from the browser otherwise", () => {
    vi.stubGlobal("navigator", { platform: "Win32" });
    render(<Mod />);
    expect(screen.getByText("windows Ctrl")).toBeTruthy();
  });
});

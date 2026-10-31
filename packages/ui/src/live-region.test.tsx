// SPDX-License-Identifier: Apache-2.0

import { act, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { LiveRegionProvider, useAnnounce } from "./live-region";

function Button({ text }: { text: string }): React.ReactElement {
  const announce = useAnnounce();
  return (
    <button
      type="button"
      onClick={() => {
        announce(text);
      }}
    >
      say
    </button>
  );
}

beforeEach(() => {
  vi.useFakeTimers();
});
afterEach(() => {
  vi.useRealTimers();
});

describe("live region", () => {
  it("is a polite status region, empty at first", () => {
    render(
      <LiveRegionProvider>
        <p>app</p>
      </LiveRegionProvider>,
    );
    const region = screen.getByRole("status");
    expect(region.getAttribute("aria-live")).toBe("polite");
    expect(region.textContent).toBe("");
  });

  it("announces a message after clearing, so repeats are read again", () => {
    render(
      <LiveRegionProvider>
        <Button text="Drew Hades" />
      </LiveRegionProvider>,
    );
    const say = screen.getByRole("button", { name: "say" });
    act(() => {
      say.click();
      vi.advanceTimersByTime(60);
    });
    expect(screen.getByRole("status").textContent).toBe("Drew Hades");
    act(() => {
      say.click();
    });
    expect(screen.getByRole("status").textContent).toBe("");
    act(() => {
      vi.advanceTimersByTime(60);
    });
    expect(screen.getByRole("status").textContent).toBe("Drew Hades");
  });

  it("does nothing outside a provider", () => {
    render(<Button text="x" />);
    expect(() => {
      screen.getByRole("button").click();
    }).not.toThrow();
  });
});

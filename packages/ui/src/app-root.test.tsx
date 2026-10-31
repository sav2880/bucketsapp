// SPDX-License-Identifier: Apache-2.0

import { createMemoryStorage, createSettingsStore } from "@buckets/storage";
import { render, screen } from "@testing-library/react";
import type { ReactNode } from "react";
import { describe, expect, it, vi } from "vitest";
import { AppRoot } from "./app-root";

// The panes need real layout measurements, which jsdom cannot give (see shell.test.tsx).
vi.mock("./layout/resizable-layout", () => ({
  ResizableLayout: ({ panes }: { panes: readonly { id: string; content: ReactNode }[] }) => (
    <div>
      {panes.map((pane) => (
        <div key={pane.id}>{pane.content}</div>
      ))}
    </div>
  ),
}));

describe("AppRoot", () => {
  it("opens an empty library and shows the shell", async () => {
    render(<AppRoot storage={createMemoryStorage()} />);
    expect(screen.getByText("Opening your buckets…")).toBeTruthy();
    expect(await screen.findByTestId("shell")).toBeTruthy();
  });

  it("keeps the same member and device ids on the next start", async () => {
    const storage = createMemoryStorage();
    const first = render(<AppRoot storage={storage} />);
    await screen.findByTestId("shell");
    const settings = createSettingsStore(storage);
    const ids = [await settings.get("member-id"), await settings.get("device-id")];
    expect(ids.every((id) => typeof id === "string" && id !== "")).toBe(true);
    first.unmount();
    render(<AppRoot storage={storage} />);
    await screen.findByTestId("shell");
    expect([await settings.get("member-id"), await settings.get("device-id")]).toEqual(ids);
  });

  it("refuses a damaged library instead of replacing it", async () => {
    const storage = createMemoryStorage();
    const damaged = new Uint8Array([1, 2, 3]);
    await storage.write("library", damaged);
    render(<AppRoot storage={storage} />);
    expect(await screen.findByRole("alert")).toBeTruthy();
    expect(await storage.read("library")).toEqual(damaged);
    expect(screen.queryByTestId("shell")).toBeNull();
  });

  it("saves when the window is hidden", async () => {
    const storage = createMemoryStorage();
    render(<AppRoot storage={storage} />);
    await screen.findByTestId("shell");
    window.dispatchEvent(new Event("pagehide"));
    expect(await storage.read("library")).toBeTruthy();
  });
});

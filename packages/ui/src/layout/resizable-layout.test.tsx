// SPDX-License-Identifier: Apache-2.0

import { createMemoryStorage, createSettingsStore } from "@buckets/storage";
import { render, screen } from "@testing-library/react";
import { beforeAll, describe, expect, it, vi } from "vitest";
import { ResizableLayout, type PaneSpec } from "./resizable-layout";

beforeAll(() => {
  // jsdom has no layout engine; the panels library only needs these to exist.
  vi.stubGlobal(
    "ResizeObserver",
    class {
      observe(): void {}
      unobserve(): void {}
      disconnect(): void {}
    },
  );
});

const panes: PaneSpec[] = [
  {
    id: "sidebar",
    label: "Sidebar",
    content: <nav>side</nav>,
    defaultSize: 232,
    minSize: 180,
    maxSize: 360,
    collapsible: true,
  },
  { id: "main", label: "Main", content: <main>middle</main>, minSize: 300 },
  {
    id: "details",
    label: "Details",
    content: <aside>right</aside>,
    defaultSize: 304,
    minSize: 260,
    maxSize: 460,
    collapsible: true,
  },
];

describe("ResizableLayout", () => {
  it("shows every pane with a labelled divider before each pane after the first", async () => {
    render(<ResizableLayout id="shell" panes={panes} />);
    expect(await screen.findByText("side")).toBeTruthy();
    expect(screen.getByText("middle")).toBeTruthy();
    expect(screen.getByText("right")).toBeTruthy();
    expect(screen.getAllByRole("separator").map((s) => s.getAttribute("aria-label"))).toEqual([
      "Resize Sidebar",
      "Resize Details",
    ]);
  });

  it("waits for saved sizes before showing anything", async () => {
    const settings = createSettingsStore(createMemoryStorage());
    await settings.set("layout-shell", { sidebar: 20, main: 60, details: 20 });
    render(<ResizableLayout id="shell" panes={panes} settings={settings} />);
    expect(screen.queryByText("middle")).toBeNull();
    expect(await screen.findByText("middle")).toBeTruthy();
  });

  it("ignores saved sizes that aren't sizes", async () => {
    const settings = createSettingsStore(createMemoryStorage());
    await settings.set("layout-shell", { sidebar: "wide" });
    render(<ResizableLayout id="shell" panes={panes} settings={settings} />);
    expect(await screen.findByText("middle")).toBeTruthy();
  });
});

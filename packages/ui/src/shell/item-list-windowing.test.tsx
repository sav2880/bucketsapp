// SPDX-License-Identifier: Apache-2.0

import { addItem } from "@buckets/core";
import { act, fireEvent, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { renderShell, setViewportWidth, type ShellHarness } from "../../test/harness";

// The panes need real layout measurements, which jsdom cannot give (see shell.test.tsx).
vi.mock("../layout/resizable-layout", () => ({
  ResizableLayout: ({ panes }: { panes: readonly { id: string; content: ReactNode }[] }) => (
    <div>
      {panes.map((pane) => (
        <div key={pane.id}>{pane.content}</div>
      ))}
    </div>
  ),
}));

/** Pretends the bucket pane is this tall, which is what switches windowing on. */
const VIEWPORT = 400;
let restore: (() => void) | undefined;

beforeEach(() => {
  const original = Object.getOwnPropertyDescriptor(HTMLElement.prototype, "clientHeight");
  Object.defineProperty(HTMLElement.prototype, "clientHeight", {
    configurable: true,
    get: () => VIEWPORT,
  });
  // In a browser the list moves up the screen as the pane scrolls; jsdom has no layout, so say so.
  const rect = vi.spyOn(Element.prototype, "getBoundingClientRect").mockImplementation(function (
    this: Element,
  ): DOMRect {
    const top =
      this.getAttribute("role") === "rowgroup"
        ? -(document.querySelector("main")?.scrollTop ?? 0)
        : 0;
    return { top, left: 0, right: 0, bottom: top, width: 0, height: 0, x: 0, y: top } as DOMRect;
  });
  restore = () => {
    rect.mockRestore();
    if (original) Object.defineProperty(HTMLElement.prototype, "clientHeight", original);
    else Reflect.deleteProperty(HTMLElement.prototype, "clientHeight");
  };
});

afterEach(() => {
  restore?.();
  setViewportWidth(1200);
});

async function makeBucket(name: string): Promise<void> {
  await userEvent.click(
    (await screen.findAllByRole("button", { name: "New bucket" }))[0] as HTMLElement,
  );
  const dialog = await screen.findByRole("dialog", { name: "New bucket" });
  await userEvent.type(within(dialog).getByRole("textbox", { name: "Name" }), name);
  await userEvent.click(within(dialog).getByRole("button", { name: "Create" }));
}

/** Makes a bucket and fills it with items, as one change per item (as the app would). */
async function bucketWith(count: number): Promise<ShellHarness> {
  const h = await renderShell();
  await makeBucket("Big");
  const id = h.store.getState().library.bucketOrder[0] ?? "";
  act(() => {
    for (let i = 1; i <= count; i += 1)
      h.store.updateBucket(id, (b) =>
        addItem(
          b,
          { title: `Item ${String(i)}` },
          { memberId: "me", now: new Date(h.clock.ms), makeId: () => `item-${String(i)}` },
        ),
      );
  });
  return h;
}

const drawn = (): string[] =>
  screen
    .queryAllByRole<HTMLInputElement>("textbox", { name: /^Title of / })
    .map((input) => input.value);

/** Scrolls the bucket pane, as a person would. */
function scrollTo(top: number): void {
  const pane = screen.getByRole("main");
  Object.defineProperty(pane, "scrollTop", { configurable: true, value: top });
  fireEvent.scroll(pane);
}

describe("a long list", () => {
  it("draws only the rows near the top, with the rest counted for screen readers", async () => {
    await bucketWith(300);
    const rows = drawn();
    expect(rows.length).toBeGreaterThan(5);
    expect(rows.length).toBeLessThan(60);
    expect(rows[0]).toBe("Item 1");
    // 300 items and the header row.
    expect(screen.getByTestId("columns").getAttribute("aria-rowcount")).toBe("301");
    expect(screen.getByTestId("item-item-1").getAttribute("aria-rowindex")).toBe("2");
  });

  it("holds the whole list's height so the scroll bar is the right size", async () => {
    await bucketWith(300);
    const group = screen.getByTestId("item-item-1").parentElement as HTMLElement;
    const container = group.parentElement as HTMLElement;
    // 300 rows at the estimated height.
    expect(Number.parseInt(container.style.height, 10)).toBe(300 * 36);
    expect(group.style.position).toBe("absolute");
  });

  it("draws the rows that scrolling brings into range", async () => {
    await bucketWith(300);
    act(() => {
      scrollTo(36 * 150);
    });
    const rows = drawn();
    expect(rows).toContain("Item 151");
    expect(rows).not.toContain("Item 1");
    expect(rows.length).toBeLessThan(60);
    // Rows keep their place in the table whichever are drawn.
    expect(screen.getByTestId("item-item-151").getAttribute("aria-rowindex")).toBe("152");
  });

  it("keeps the row being edited drawn after it is scrolled out of range", async () => {
    await bucketWith(300);
    const box = screen.getByRole("textbox", { name: "Title of Item 1" });
    act(() => {
      box.focus();
    });
    act(() => {
      scrollTo(36 * 200);
    });
    expect(drawn()).toContain("Item 1");
    expect(drawn()).toContain("Item 201");
    // Leaving the row lets it go.
    act(() => {
      (document.activeElement as HTMLElement).blur();
    });
    expect(drawn()).not.toContain("Item 1");
  });

  it("saves a half-typed title when you leave a row that is out of range", async () => {
    const h = await bucketWith(300);
    const box = screen.getByRole("textbox", { name: "Title of Item 1" });
    await userEvent.click(box);
    await userEvent.clear(box);
    await userEvent.type(box, "Edited");
    act(() => {
      scrollTo(36 * 200);
    });
    await userEvent.click(await screen.findByRole("textbox", { name: "Add an item" }));
    const bucket = Object.values(h.store.getState().buckets)[0];
    expect(bucket?.items["item-1"]?.title).toBe("Edited");
  });

  it("arrow keys move on to a row that is not drawn yet", async () => {
    await bucketWith(300);
    const last = drawn().length;
    const row = screen.getByTestId("item-item-1");
    act(() => {
      row.focus();
    });
    // Walk past the last drawn row.
    for (let i = 0; i < last + 3; i += 1) {
      const active = document.activeElement as HTMLElement;
      fireEvent.keyDown(active, { key: "ArrowDown" });
      await act(async () => {
        await Promise.resolve();
      });
    }
    const focused = document.activeElement as HTMLElement;
    expect(focused.getAttribute("data-testid")).toBe(`item-item-${String(last + 4)}`);
  });

  it("selects by id, so a range can include rows that are not drawn", async () => {
    await bucketWith(300);
    fireEvent.click(screen.getByTestId("item-item-1"));
    act(() => {
      scrollTo(36 * 280);
    });
    fireEvent.click(screen.getByTestId("item-item-290"), { shiftKey: true });
    expect(screen.getAllByText("290 items selected").length).toBeGreaterThan(0);
  });
});

describe("a short list", () => {
  it("is drawn in full", async () => {
    await bucketWith(8);
    expect(drawn()).toHaveLength(8);
    expect(screen.getByTestId("columns").getAttribute("aria-rowcount")).toBe("9");
  });
});

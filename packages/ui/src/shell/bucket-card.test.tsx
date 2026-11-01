// SPDX-License-Identifier: Apache-2.0

import { addItem, addStep } from "@buckets/core";
import { act, fireEvent, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ReactNode } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
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

afterEach(() => {
  vi.restoreAllMocks();
  setViewportWidth(1200);
});

async function makeBucket(name: string, preset: RegExp): Promise<void> {
  await userEvent.click(
    (await screen.findAllByRole("button", { name: "New bucket" }))[0] as HTMLElement,
  );
  const dialog = await screen.findByRole("dialog", { name: "New bucket" });
  await userEvent.type(within(dialog).getByRole("textbox", { name: "Name" }), name);
  await userEvent.click(within(dialog).getByRole("radio", { name: preset }));
  await userEvent.click(within(dialog).getByRole("button", { name: "Create" }));
}

async function addItems(...titles: string[]): Promise<void> {
  const box = await screen.findByRole("textbox", { name: "Add an item" });
  for (const title of titles) await userEvent.type(box, `${title}{Enter}`);
}

const bucketId = (h: ShellHarness): string => h.store.getState().library.bucketOrder[0] ?? "";
const ctx = (h: ShellHarness, id: string): Parameters<typeof addItem>[2] => ({
  memberId: "me",
  now: new Date(h.clock.ms),
  makeId: () => id,
});

describe("the card in hand", () => {
  it("shows when it was drawn, the notes, and how many steps are done", async () => {
    const h = await renderShell();
    await makeBucket("Games", /Grab/);
    await addItems("Hades");
    const id = bucketId(h);
    const itemId = h.store.getState().buckets[id]?.itemOrder[0] ?? "";
    act(() => {
      h.store.updateBucket(id, (b) => {
        const item = b.items[itemId];
        if (item) item.notes = "Try the bow";
        addStep(b, itemId, "Beat the boss", ctx(h, "s1"));
        return addStep(b, itemId, "Find the keepsake", ctx(h, "s2"));
      });
    });
    await userEvent.click(screen.getByTestId("draw"));
    const card = await screen.findByTestId(/^hand-/);
    expect(within(card).getByText("Just drawn")).toBeTruthy();
    expect(within(card).getByText("Try the bow")).toBeTruthy();
    expect(within(card).getByText("0 of 2 steps")).toBeTruthy();
    await userEvent.click(within(card).getByRole("checkbox", { name: "Beat the boss" }));
    expect(within(card).getByText("1 of 2 steps")).toBeTruthy();
  });

  it("says how long it has been in hand", async () => {
    const h = await renderShell();
    await makeBucket("Games", /Grab/);
    await addItems("Hades");
    await userEvent.click(screen.getByTestId("draw"));
    await screen.findByTestId(/^hand-/);
    h.clock.ms += 2 * 60 * 60 * 1000;
    // Any change to the library makes the pane look at the clock again.
    act(() => {
      h.store.updateBucket(bucketId(h), (b) => addItem(b, { title: "Another" }, ctx(h, "another")));
    });
    await waitFor(() => {
      expect(within(screen.getByTestId(/^hand-/)).getByText("In hand for 2 h")).toBeTruthy();
    });
  });
});

describe("the done pile", () => {
  it("is there for a bucket that removes finished items, and counts them", async () => {
    await renderShell();
    await makeBucket("Games", /Grab/);
    expect(screen.getByRole("button", { name: "Done pile, 0 items. Show the list." })).toBeTruthy();
    await addItems("Hades");
    await userEvent.click(screen.getByTestId("draw"));
    await userEvent.click(await screen.findByTestId("done"));
    expect(
      await screen.findByRole("button", { name: "Done pile, 1 item. Show the list." }),
    ).toBeTruthy();
  });

  it("is hidden when finished items go back in and none are done", async () => {
    await renderShell();
    await makeBucket("Rotation", /Rotation/);
    expect(screen.queryByTestId("done-pile")).toBeNull();
  });

  it("scrolls to the list, smoothly unless motion is reduced", async () => {
    const scroll = vi.spyOn(Element.prototype, "scrollIntoView");
    await renderShell();
    await makeBucket("Games", /Grab/);
    await userEvent.click(screen.getByTestId("done-pile"));
    expect(scroll).toHaveBeenLastCalledWith({ behavior: "smooth", block: "start" });

    await userEvent.click(screen.getByRole("button", { name: "Bucket" }));
    await userEvent.selectOptions(screen.getByRole("combobox", { name: "Motion" }), "reduce");
    await userEvent.click(screen.getByTestId("done-pile"));
    expect(scroll).toHaveBeenLastCalledWith({ behavior: "auto", block: "start" });
  });
});

describe("the line under the Draw button", () => {
  it("counts what is inside", async () => {
    await renderShell();
    await makeBucket("Games", /Grab/);
    await addItems("Hades");
    expect(await screen.findByText("1 item inside.")).toBeTruthy();
    await addItems("Celeste");
    expect(await screen.findByText("2 items inside.")).toBeTruthy();
  });

  it("counts folded slips in a Mystery Bag", async () => {
    await renderShell();
    await makeBucket("Secrets", /Mystery/);
    await addItems("One", "Two");
    expect(await screen.findByText("2 folded slips inside. No peeking.")).toBeTruthy();
  });

  it("says how many it will draw when it is more than one", async () => {
    await renderShell();
    await makeBucket("Daily", /Daily/);
    await addItems("A", "B", "C");
    expect(await screen.findByRole("button", { name: "Draw 2" })).toBeTruthy();
  });

  it("says it is drawing while the slip is on its way", async () => {
    const { recorder } = await import("../../test/recording-animator");
    const r = recorder({ hold: true });
    await renderShell({ animator: r.animator });
    await makeBucket("Games", /Grab/);
    await addItems("Hades");
    await userEvent.click(screen.getByTestId("draw"));
    expect(await screen.findByText("Drawing…")).toBeTruthy();
    expect(screen.getByTestId("draw").getAttribute("aria-disabled")).toBe("true");
  });
});

/** Presses Tab until the element with this test id has focus. */
async function tabTo(testId: string): Promise<void> {
  for (let i = 0; i < 60 && document.activeElement !== screen.getByTestId(testId); i += 1)
    await userEvent.tab();
  expect(document.activeElement).toBe(screen.getByTestId(testId));
}

describe("the explanation over the bucket", () => {
  async function coveredBucket(): Promise<void> {
    await renderShell();
    await makeBucket("Games", /Grab/);
    await addItems("Hades");
    await userEvent.click(screen.getByTestId("draw"));
    await screen.findByTestId(/^hand-/);
    // jsdom calls every focus "keyboard focus"; in a browser a click wouldn't show the tooltip.
    act(() => {
      screen.getByTestId("draw").blur();
    });
  }

  it("appears over the bucket drawing while the lid is on, and goes away again", async () => {
    await coveredBucket();
    expect(screen.queryByTestId("bucket-tooltip")).toBeNull();
    fireEvent.pointerOver(screen.getByTestId("bucket-art"));
    expect(screen.getByTestId("bucket-tooltip").getAttribute("data-text")).toMatch(
      /Finish or toss back Hades/,
    );
    fireEvent.pointerOver(screen.getByTestId("draw"));
    expect(screen.queryByTestId("bucket-tooltip")).toBeNull();
  });

  it("stays out of the page text so nothing is read twice", async () => {
    await coveredBucket();
    fireEvent.pointerOver(screen.getByTestId("bucket-art"));
    expect(screen.getByTestId("bucket-tooltip").getAttribute("aria-hidden")).toBe("true");
    expect(screen.getByTestId("bucket-tooltip").textContent).toBe("");
  });

  it("appears when the Draw button gets keyboard focus, and Escape hides it", async () => {
    await coveredBucket();
    await tabTo("draw");
    expect(screen.getByTestId("bucket-tooltip")).toBeTruthy();
    await userEvent.keyboard("{Escape}");
    expect(screen.queryByTestId("bucket-tooltip")).toBeNull();
    // It comes back once attention has left and returned.
    await userEvent.tab({ shift: true });
    await tabTo("draw");
    expect(screen.getByTestId("bucket-tooltip")).toBeTruthy();
  });

  it("leaves when the pointer leaves the bucket", async () => {
    await coveredBucket();
    fireEvent.pointerOver(screen.getByTestId("bucket-art"));
    fireEvent.pointerLeave(screen.getByTestId("bucket-art").parentElement as HTMLElement);
    expect(screen.queryByTestId("bucket-tooltip")).toBeNull();
  });

  it("says nothing when the bucket is open", async () => {
    await renderShell();
    await makeBucket("Games", /Grab/);
    await addItems("Hades");
    fireEvent.pointerOver(screen.getByTestId("bucket-art"));
    expect(screen.queryByTestId("bucket-tooltip")).toBeNull();
  });
});

describe("the motion setting", () => {
  it("is kept on this device and applies at once", async () => {
    const h = await renderShell();
    await makeBucket("Games", /Grab/);
    await userEvent.click(screen.getByRole("button", { name: "Bucket" }));
    const select = screen.getByRole<HTMLSelectElement>("combobox", { name: "Motion" });
    expect(select.value).toBe("system");
    await userEvent.selectOptions(select, "reduce");
    expect(screen.getByTestId("bucket-art").hasAttribute("data-reduced")).toBe(true);
    await waitFor(async () => {
      expect(await h.environment.settings?.get("motion")).toBe("reduce");
    });
    await userEvent.selectOptions(select, "allow");
    expect(screen.getByTestId("bucket-art").hasAttribute("data-reduced")).toBe(false);
  });

  it("comes back the next time the app opens", async () => {
    const first = await renderShell();
    await makeBucket("Games", /Grab/);
    await userEvent.click(screen.getByRole("button", { name: "Bucket" }));
    await userEvent.selectOptions(screen.getByRole("combobox", { name: "Motion" }), "reduce");
    await waitFor(async () => {
      expect(await first.environment.settings?.get("motion")).toBe("reduce");
    });
    await first.store.flush();
    document.body.innerHTML = "";
    await renderShell({ adapter: first.adapter });
    await waitFor(() => {
      expect(screen.getByTestId("bucket-art").hasAttribute("data-reduced")).toBe(true);
    });
  });
});

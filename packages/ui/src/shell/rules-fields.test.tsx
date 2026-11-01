// SPDX-License-Identifier: Apache-2.0

import { act, screen, waitFor, within } from "@testing-library/react";
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

const rulesOf = (h: ShellHarness): { maxInHand: number; drawCount: number } => {
  const id = h.store.getState().library.bucketOrder[0] ?? "";
  const rules = h.store.getState().buckets[id]?.rules;
  return { maxInHand: rules?.maxInHand ?? 0, drawCount: rules?.drawCount ?? 0 };
};

const cards = (): HTMLElement[] => screen.queryAllByTestId(/^hand-/);

/** Opens the bucket details and returns the "Most in hand" box. */
async function maxInHandBox(): Promise<HTMLInputElement> {
  await userEvent.click(screen.getByRole("button", { name: "Bucket" }));
  return screen.getByRole<HTMLInputElement>("spinbutton", { name: "Most in hand" });
}

describe("changing how many can be in hand", () => {
  it("applies as soon as it is typed, even if the box still has focus when drawing", async () => {
    const h = await renderShell();
    await makeBucket("Daily", /Daily/);
    await addItems("A", "B", "C", "D");
    const box = await maxInHandBox();
    await userEvent.clear(box);
    await userEvent.type(box, "1");
    // No click elsewhere: the box keeps focus, and the draw shortcut is used.
    expect(document.activeElement).toBe(box);
    expect(rulesOf(h).maxInHand).toBe(1);
    await userEvent.keyboard("{Control>}d{/Control}");
    await waitFor(() => {
      expect(cards()).toHaveLength(1);
    });
  });

  it("waits for a whole number before changing anything", async () => {
    const h = await renderShell();
    await makeBucket("Daily", /Daily/);
    const box = await maxInHandBox();
    await userEvent.clear(box);
    expect(rulesOf(h).maxInHand).toBe(2);
    await userEvent.type(box, "0");
    expect(rulesOf(h).maxInHand).toBe(2);
    await userEvent.type(box, "{Backspace}3");
    expect(rulesOf(h).maxInHand).toBe(3);
  });

  it("puts the last good number back when the box is left empty", async () => {
    const h = await renderShell();
    await makeBucket("Daily", /Daily/);
    const box = await maxInHandBox();
    await userEvent.clear(box);
    await userEvent.tab();
    expect(box.value).toBe("2");
    expect(rulesOf(h).maxInHand).toBe(2);
  });

  it("freezes drawing until the hand is back under a lowered limit", async () => {
    const h = await renderShell();
    await makeBucket("Daily", /Daily/);
    await addItems("A", "B", "C", "D");
    await userEvent.click(screen.getByTestId("draw"));
    await waitFor(() => {
      expect(cards()).toHaveLength(2);
    });
    // The clock stands still in tests; events need to be told apart in time, as in real life.
    h.clock.ms += 60_000;
    const box = await maxInHandBox();
    await userEvent.clear(box);
    await userEvent.type(box, "1");
    expect(rulesOf(h).maxInHand).toBe(1);

    // Two are still in hand, which is allowed, but nothing more can be drawn.
    expect(cards()).toHaveLength(2);
    const draw = screen.getByTestId("draw");
    expect(draw.getAttribute("aria-disabled")).toBe("true");
    expect(screen.getByText("Your hand is full. Finish or toss back an item first.")).toBeTruthy();

    h.clock.ms += 60_000;
    // Finishing one still leaves the hand at the new limit, so still no draw.
    await userEvent.click(within(cards()[0] as HTMLElement).getByTestId("done"));
    await waitFor(() => {
      expect(cards()).toHaveLength(1);
    });
    await waitFor(() => {
      expect(screen.getByTestId("draw").getAttribute("aria-disabled")).toBe("true");
    });

    h.clock.ms += 60_000;
    // Let the first finish's animation sequence end; it blocks the next action while it runs.
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 0));
    });

    // Only when the hand is empty is there an open slot again.
    await userEvent.click(within(cards()[0] as HTMLElement).getByTestId("done"));
    await waitFor(() => {
      expect(cards()).toHaveLength(0);
    });
    await waitFor(() => {
      expect(screen.getByTestId("draw").getAttribute("aria-disabled")).toBe("false");
    });
    await userEvent.click(screen.getByTestId("draw"));
    await waitFor(() => {
      expect(cards()).toHaveLength(1);
    });
  });

  it("applies the items-per-draw box the same way", async () => {
    const h = await renderShell();
    await makeBucket("Daily", /Daily/);
    await userEvent.click(screen.getByRole("button", { name: "Bucket" }));
    const box = screen.getByRole<HTMLInputElement>("spinbutton", { name: "Items per draw" });
    await userEvent.clear(box);
    await userEvent.type(box, "1");
    expect(rulesOf(h).drawCount).toBe(1);
  });
});

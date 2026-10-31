// SPDX-License-Identifier: Apache-2.0

import { act, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ReactNode } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { renderShell, setViewportWidth } from "../../test/harness";
import { recorder } from "../../test/recording-animator";

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

const live = (): string => screen.getByTestId("live-region").textContent;
const card = (): HTMLElement => screen.getByTestId(/^hand-/);

describe("drawing with animation", () => {
  it("says what was drawn straight away, and shows the card when the slip lands", async () => {
    const r = recorder({ hold: true });
    await renderShell({ animator: r.animator });
    await makeBucket("Games", /Grab/);
    await addItems("Hades");

    await userEvent.click(screen.getByTestId("draw"));
    await waitFor(() => {
      expect(live()).toMatch(/Hades/);
    });
    // The data has changed and the card exists, but it can't be seen or reached yet.
    expect(card().hasAttribute("inert")).toBe(true);
    expect(card().style.opacity).toBe("0");
    expect(screen.getByTestId("draw").getAttribute("aria-describedby")).toBeTruthy();

    await act(async () => {
      r.release();
      await Promise.resolve();
    });
    await act(async () => {
      r.release();
      await Promise.resolve();
    });
    await act(async () => {
      r.release();
      await Promise.resolve();
    });
    await waitFor(() => {
      expect(card().hasAttribute("inert")).toBe(false);
    });
    expect(card().style.opacity).toBe("");
    expect(r.log.filter((l) => !l.startsWith("cancel"))).toEqual(["wobble", "flySlip", "settle"]);
  });

  it("takes the lid off while the slip leaves, and shows the surprised face", async () => {
    const r = recorder({ hold: true });
    await renderShell({ animator: r.animator });
    await makeBucket("Games", /Grab/);
    await addItems("Hades");
    await userEvent.click(screen.getByTestId("draw"));
    await waitFor(() => {
      expect(screen.getByTestId("bucket-lid").classList.contains("on")).toBe(false);
    });
    expect(
      screen.getByTestId("bucket-art").querySelector("[data-mood]")?.getAttribute("data-mood"),
    ).toBe("wow");
    await act(async () => {
      for (let i = 0; i < 4; i += 1) {
        r.release();
        await Promise.resolve();
      }
    });
    // Hand is full and everything is locked behind it once the slip has landed.
    await waitFor(() => {
      expect(screen.getByTestId("bucket-lid").classList.contains("on")).toBe(true);
    });
  });

  it("ignores finishing while the slip is still flying", async () => {
    const r = recorder({ hold: true });
    await renderShell({ animator: r.animator });
    await makeBucket("Games", /Grab/);
    await addItems("Hades");
    await userEvent.click(screen.getByTestId("draw"));
    await waitFor(() => {
      expect(live()).toMatch(/Hades/);
    });
    await userEvent.keyboard("{Control>}{Enter}{/Control}");
    expect(live()).not.toMatch(/Finished/);
    expect(card()).toBeTruthy();
  });

  it("shakes the bucket and explains when a draw is refused", async () => {
    const r = recorder();
    await renderShell({ animator: r.animator });
    await makeBucket("Games", /Grab/);
    await addItems("Hades", "Celeste");
    await userEvent.click(screen.getByTestId("draw"));
    await waitFor(() => {
      expect(card()).toBeTruthy();
    });
    r.log.length = 0;
    // The Draw button looks off but can still be pressed, and says why it can't draw.
    await userEvent.click(screen.getByTestId("draw"));
    await waitFor(() => {
      expect(live()).toMatch(/Finish or toss back (Hades|Celeste)/);
    });
    expect(r.log).toEqual(["shake"]);
    expect(
      screen.getByTestId("bucket-art").querySelector("[data-mood]")?.getAttribute("data-mood"),
    ).toBe("no");
  });
});

describe("finishing and tossing back with animation", () => {
  it("copies the card first, and sends it to the bucket when tossed back", async () => {
    const r = recorder();
    await renderShell({ animator: r.animator });
    await makeBucket("Games", /Grab/);
    await addItems("Hades");
    await userEvent.click(screen.getByTestId("draw"));
    await userEvent.click(await screen.findByTestId("toss-back"));
    await userEvent.click(within(await screen.findByRole("dialog")).getByTestId("confirm"));
    await waitFor(() => {
      expect(live()).toMatch(/Tossed back Hades/);
    });
    const names = r.log.filter((l) => !l.startsWith("cancel"));
    // The copy is taken before the card is removed, then it flies, then the bucket plops.
    expect(names.indexOf("ghost")).toBeLessThan(names.indexOf("ghost.flyTo"));
    expect(names.indexOf("ghost.flyTo")).toBeLessThan(names.indexOf("plop"));
  });

  it("lets a second draw happen once the first sequence is over", async () => {
    const r = recorder();
    await renderShell({ animator: r.animator });
    await makeBucket("Games", /Grab/);
    await addItems("Hades");
    await userEvent.click(screen.getByTestId("draw"));
    await userEvent.click(await screen.findByTestId("done"));
    await waitFor(() => {
      expect(live()).toMatch(/Finished Hades/);
    });
    await addItems("Celeste");
    await userEvent.click(screen.getByTestId("draw"));
    await waitFor(() => {
      expect(live()).toMatch(/Celeste/);
    });
  });
});

describe("a Mystery Bag", () => {
  it("keeps the title off the card until it flips", async () => {
    const r = recorder({ hold: true });
    await renderShell({ animator: r.animator });
    await makeBucket("Secrets", /Mystery/);
    await addItems("Surprise");
    await userEvent.click(screen.getByTestId("draw"));
    await waitFor(() => {
      expect(live()).toMatch(/Surprise/);
    });
    // Wobble and fly, then the card is shown but the flip is still waiting.
    await act(async () => {
      r.release();
      await Promise.resolve();
    });
    await act(async () => {
      r.release();
      await Promise.resolve();
    });
    await waitFor(() => {
      expect(r.log).toContain("flip");
    });
    // The card can't be read or reached until the title is revealed.
    expect(card().hasAttribute("inert")).toBe(false);
    expect(r.log).toContain("flip.midpoint");
    await act(async () => {
      r.release();
      await Promise.resolve();
    });
    await waitFor(() => {
      expect(card().querySelector("button")?.style.color).toBe("");
    });
  });
});

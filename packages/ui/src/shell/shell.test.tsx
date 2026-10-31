// SPDX-License-Identifier: Apache-2.0

import { addItem, addStep } from "@buckets/core";
import { act, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ReactNode } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { renderShell, setViewportWidth, type ShellHarness } from "../../test/harness";

// react-resizable-panels needs real layout measurements, which jsdom cannot give; the panes are
// tested on their own in layout/resizable-layout.test.tsx and in the browser tests.
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
  vi.unstubAllGlobals();
  setViewportWidth(1200);
});

/** Makes a bucket through the New bucket dialog, as a user would. */
async function makeBucket(name: string, preset = /Grab/): Promise<void> {
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

async function announced(text: RegExp | string): Promise<void> {
  await waitFor(() => {
    expect(live()).toMatch(text);
  });
}

describe("an empty app", () => {
  it("invites the user to make a bucket", async () => {
    await renderShell();
    expect(await screen.findByText("No buckets yet. Make one to start drawing.")).toBeTruthy();
    expect(screen.getByText("Choose a bucket, or make a new one.")).toBeTruthy();
  });

  it("makes a bucket from the dialog and shows it, empty, with Draw switched off", async () => {
    const { store } = await renderShell();
    await makeBucket("Games");
    expect(await screen.findByRole("heading", { name: "Games" })).toBeTruthy();
    expect(Object.values(store.getState().buckets).map((b) => b.name)).toEqual(["Games"]);
    expect(screen.getByTestId<HTMLButtonElement>("draw").disabled).toBe(true);
    expect(screen.getByText("Nothing to draw. Add an item first.")).toBeTruthy();
  });

  it("won't create a bucket without a name", async () => {
    await renderShell();
    await userEvent.click(
      (await screen.findAllByRole("button", { name: "New bucket" }))[0] as HTMLElement,
    );
    const dialog = await screen.findByRole("dialog", { name: "New bucket" });
    expect(within(dialog).getByRole<HTMLButtonElement>("button", { name: "Create" }).disabled).toBe(
      true,
    );
    await userEvent.click(within(dialog).getByRole("button", { name: "Cancel" }));
    expect(screen.queryByRole("dialog", { name: "New bucket" })).toBeNull();
  });
});

describe("drawing", () => {
  it("adds items by typing, draws one, and finishes it", async () => {
    const { store } = await renderShell();
    await makeBucket("Games");
    await addItems("Hades", "Celeste");
    expect(screen.getByRole("button", { name: "Show details for Hades" })).toBeTruthy();

    await userEvent.click(screen.getByTestId("draw"));
    await announced(/^Drew (Hades|Celeste)\.$/);
    const card = screen
      .getAllByRole("listitem")
      .find((li) => li.dataset["testid"]?.startsWith("hand-"));
    expect(card).toBeTruthy();
    expect(screen.getByText(/before drawing again/)).toBeTruthy();
    expect(screen.getByTestId<HTMLButtonElement>("draw").disabled).toBe(true);

    await userEvent.click(screen.getByTestId("done"));
    await announced(/^Finished /);
    expect(screen.getByText("Nothing in your hand.")).toBeTruthy();
    const bucket = Object.values(store.getState().buckets)[0];
    expect(bucket?.events.map((e) => e.kind)).toEqual(["drawn", "done"]);
  });

  it("ticks steps on the card in your hand", async () => {
    const { store } = await renderShell();
    await makeBucket("Chores");
    await addItems("Tidy");
    const bucketId = store.getState().library.bucketOrder[0] ?? "";
    const itemId = Object.keys(store.getState().buckets[bucketId]?.items ?? {})[0] ?? "";
    act(() => {
      store.updateBucket(bucketId, (b) =>
        addStep(b, itemId, "Desk", { memberId: "me", now: new Date(), makeId: () => "s1" }),
      );
    });
    await userEvent.click(screen.getByTestId("draw"));
    await userEvent.click(await screen.findByRole("checkbox", { name: "Desk" }));
    expect(store.getState().buckets[bucketId]?.items[itemId]?.steps[0]?.done).toBe(true);
  });

  it("asks before tossing back, and puts the item back when confirmed", async () => {
    const { store } = await renderShell();
    await makeBucket("Games");
    await addItems("Hades");
    await userEvent.click(screen.getByTestId("draw"));
    await userEvent.click(await screen.findByTestId("toss-back"));
    const dialog = await screen.findByRole("dialog", { name: "Toss back “Hades”?" });
    await userEvent.click(within(dialog).getByRole("button", { name: "Cancel" }));
    expect(screen.queryByText("Nothing in your hand.")).toBeNull();

    await userEvent.click(screen.getByTestId("toss-back"));
    await userEvent.click(within(await screen.findByRole("dialog")).getByTestId("confirm"));
    await announced("Tossed back Hades.");
    expect(screen.getByText("Nothing in your hand.")).toBeTruthy();
    const kinds = Object.values(store.getState().buckets)[0]?.events.map((e) => e.kind);
    expect(kinds).toEqual(["drawn", "tossed-back"]);
  });

  it("keeps titles hidden in a Mystery Bag until they are drawn", async () => {
    await renderShell();
    await makeBucket("Surprise", /Mystery/);
    await addItems("Secret one");
    expect(screen.queryByText("Secret one")).toBeNull();
    expect(screen.getByText("Hidden until drawn")).toBeTruthy();
    await userEvent.click(screen.getByTestId("draw"));
    expect((await screen.findAllByText("Secret one")).length).toBeGreaterThan(0);
  });

  it("explains a refusal in words", async () => {
    await renderShell();
    await makeBucket("Games");
    await addItems("Hades");
    await userEvent.click(screen.getByTestId("draw"));
    expect(
      await screen.findByText(/^Finish or toss back (Hades) before drawing again\.$/),
    ).toBeTruthy();
  });

  it("uses keyboard shortcuts to draw and finish", async () => {
    await renderShell();
    await makeBucket("Games");
    await addItems("Hades");
    await userEvent.keyboard("{Control>}d{/Control}");
    await announced("Drew Hades.");
    await userEvent.keyboard("{Control>}{Enter}{/Control}");
    await announced("Finished Hades.");
  });
});

describe("details", () => {
  it("edits an item's title, adds a step, and deletes it after confirming", async () => {
    const { store } = await renderShell();
    await makeBucket("Games");
    await addItems("Hades");
    await userEvent.click(screen.getByRole("button", { name: "Show details for Hades" }));

    const inspector = await screen.findByTestId("item-inspector");
    const title = within(inspector).getByRole("textbox", { name: "Title" });
    await userEvent.clear(title);
    await userEvent.type(title, "Hades II");
    await userEvent.tab();
    const bucketId = store.getState().library.bucketOrder[0] ?? "";
    const items = () => Object.values(store.getState().buckets[bucketId]?.items ?? {});
    expect(items().map((i) => i.title)).toEqual(["Hades II"]);

    await userEvent.type(
      within(inspector).getByRole("textbox", { name: "Add a step" }),
      "Boons{Enter}",
    );
    expect(items()[0]?.steps.map((s) => s.title)).toEqual(["Boons"]);

    await userEvent.click(within(inspector).getByRole("button", { name: "Delete item" }));
    await userEvent.click(within(await screen.findByRole("dialog")).getByTestId("confirm"));
    expect(items()).toEqual([]);
  });

  it("changes the bucket's name and a rule, and refuses a bad time zone", async () => {
    const { store } = await renderShell();
    await makeBucket("Games");
    const inspector = await screen.findByTestId("bucket-inspector");
    const name = within(inspector).getByRole("textbox", { name: "Name" });
    await userEvent.clear(name);
    await userEvent.type(name, "Play");
    await userEvent.tab();
    const bucketId = store.getState().library.bucketOrder[0] ?? "";
    expect(store.getState().buckets[bucketId]?.name).toBe("Play");

    await userEvent.selectOptions(
      within(inspector).getByRole("combobox", { name: "When an item is finished" }),
      "return",
    );
    expect(store.getState().buckets[bucketId]?.rules.onDone).toBe("return");
    expect(store.getState().buckets[bucketId]?.preset).toBe("custom");

    const zone = within(inspector).getByRole("textbox", { name: "Time zone" });
    await userEvent.clear(zone);
    await userEvent.type(zone, "Mars/Base");
    await userEvent.tab();
    expect(await screen.findByText("That isn't a time zone Buckets knows.")).toBeTruthy();
  });

  it("deletes a bucket after confirming", async () => {
    const { store } = await renderShell();
    await makeBucket("Games");
    await userEvent.click(await screen.findByTestId("delete-bucket"));
    await userEvent.click(within(await screen.findByRole("dialog")).getByTestId("confirm"));
    await waitFor(() => {
      expect(store.getState().library.bucketOrder).toEqual([]);
    });
    expect(await screen.findByText("Choose a bucket, or make a new one.")).toBeTruthy();
  });
});

describe("narrow windows", () => {
  it("moves the details into a sheet below 900 px", async () => {
    await renderShell({ width: 700 });
    await makeBucket("Games");
    await addItems("Hades");
    expect(screen.queryByRole("complementary", { name: "Details" })).toBeNull();
    await userEvent.click(screen.getByRole("button", { name: "Show details" }));
    const sheet = await screen.findByRole("dialog", { name: "Details" });
    expect(within(sheet).getByTestId("bucket-inspector")).toBeTruthy();
  });

  it("moves the buckets into a drawer below 600 px", async () => {
    await renderShell({ width: 500 });
    await makeBucket("Games");
    await userEvent.click(await screen.findByRole("button", { name: "Show buckets" }));
    const drawer = await screen.findByRole("dialog", { name: "Buckets" });
    expect(within(drawer).getByTestId(/^bucket-/)).toBeTruthy();
  });
});

describe("shortcuts", () => {
  it("opens the new bucket dialog with Ctrl+Shift+N", async () => {
    await renderShell();
    await userEvent.keyboard("{Control>}{Shift>}n{/Shift}{/Control}");
    expect(await screen.findByRole("dialog", { name: "New bucket" })).toBeTruthy();
  });

  it("focuses the add box with Ctrl+N and opens bucket settings with Ctrl+comma", async () => {
    await renderShell();
    await makeBucket("Games");
    await userEvent.keyboard("{Control>}n{/Control}");
    expect(document.activeElement).toBe(screen.getByRole("textbox", { name: "Add an item" }));
    await userEvent.keyboard("{Control>},{/Control}");
    expect(await screen.findByTestId("bucket-inspector")).toBeTruthy();
  });
});

describe("permissions and problems", () => {
  it("hides the add box from someone who can only view", async () => {
    const { store } = await renderShell();
    await makeBucket("Shared");
    const bucketId = store.getState().library.bucketOrder[0] ?? "";
    act(() => {
      store.updateBucket(bucketId, (b) => {
        const me = b.members["me"];
        if (me) me.role = "viewer";
        return { ok: true, value: undefined };
      });
    });
    expect(await screen.findByText("You can look at this bucket but not change it.")).toBeTruthy();
    expect(screen.queryByRole("textbox", { name: "Add an item" })).toBeNull();
  });

  it("shows a banner when saving fails", async () => {
    const h: ShellHarness = await renderShell();
    await makeBucket("Games");
    h.adapter.write = () => Promise.reject(new Error("disk full"));
    await addItems("Hades");
    await act(async () => {
      await h.store.flush().catch(() => undefined);
    });
    expect(await screen.findByText("Couldn't save your changes: disk full")).toBeTruthy();
  });

  it("lists buckets that can't be opened instead of hiding them", async () => {
    const first = await renderShell();
    await makeBucket("Games");
    await first.store.flush();
    const bucketId = first.store.getState().library.bucketOrder[0] ?? "";
    await first.adapter.write(`buckets/${bucketId}`, new Uint8Array([1, 2, 3]));
    document.body.innerHTML = "";
    await renderShell({ adapter: first.adapter });
    expect(
      await screen.findByText("This bucket's file is damaged and can't be opened."),
    ).toBeTruthy();
  });
});

describe("inserted items", () => {
  it("shows items added by another command right away", async () => {
    const { store } = await renderShell();
    await makeBucket("Games");
    const bucketId = store.getState().library.bucketOrder[0] ?? "";
    act(() => {
      store.updateBucket(bucketId, (b) =>
        addItem(
          b,
          { title: "From elsewhere" },
          { memberId: "me", now: new Date(), makeId: () => "x1" },
        ),
      );
    });
    expect(
      await screen.findByRole("button", { name: "Show details for From elsewhere" }),
    ).toBeTruthy();
  });
});

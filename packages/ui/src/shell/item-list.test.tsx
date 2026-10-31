// SPDX-License-Identifier: Apache-2.0

import type { Bucket } from "@buckets/core";
import { act, fireEvent, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ReactNode } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { renderShell, type ShellHarness } from "../../test/harness";

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
});

async function makeBucket(name: string, preset = /Grab/): Promise<void> {
  await userEvent.click(
    (await screen.findAllByRole("button", { name: "New bucket" }))[0] as HTMLElement,
  );
  const dialog = await screen.findByRole("dialog", { name: "New bucket" });
  await userEvent.type(within(dialog).getByRole("textbox", { name: "Name" }), name);
  await userEvent.click(within(dialog).getByRole("radio", { name: preset }));
  await userEvent.click(within(dialog).getByRole("button", { name: "Create" }));
}

async function type(...titles: string[]): Promise<void> {
  const box = await screen.findByRole("textbox", { name: "Add an item" });
  for (const title of titles) await userEvent.type(box, `${title}{Enter}`);
}

const bucketOf = (h: ShellHarness, index = 0): Bucket => {
  const id = h.store.getState().library.bucketOrder[index] ?? "";
  const bucket = h.store.getState().buckets[id];
  if (!bucket) throw new Error("no bucket");
  return bucket;
};
const titles = (h: ShellHarness, index = 0): string[] => {
  const bucket = bucketOf(h, index);
  return bucket.itemOrder.map((id) => bucket.items[id]?.title ?? "");
};
const row = (title: string): HTMLElement =>
  screen.getByRole("textbox", { name: `Title of ${title}` }).closest('[role="row"]') as HTMLElement;
const live = (): string => screen.getByTestId("live-region").textContent;

/** A stand-in for the browser's DataTransfer. */
function dataTransfer(): DataTransfer {
  const data = new Map<string, string>();
  const types: string[] = [];
  const stand = {
    types,
    effectAllowed: "all",
    setData(type: string, value: string): void {
      data.set(type, value);
      types.push(type);
    },
    getData: (type: string): string => data.get(type) ?? "",
    files: [],
  };
  return stand as unknown as DataTransfer;
}

describe("typing items", () => {
  it("adds a row for each Return and keeps the cursor on the empty row", async () => {
    const h = await renderShell();
    await makeBucket("Games");
    await type("Hades", "Celeste");
    expect(titles(h)).toEqual(["Hades", "Celeste"]);
    expect(document.activeElement).toBe(screen.getByRole("textbox", { name: "Add an item" }));
  });

  it("edits a title in place: Return saves, Escape puts it back", async () => {
    const h = await renderShell();
    await makeBucket("Games");
    await type("Hades");
    const input = screen.getByRole("textbox", { name: "Title of Hades" });
    await userEvent.clear(input);
    await userEvent.type(input, "Hades II{Enter}");
    expect(titles(h)).toEqual(["Hades II"]);
    expect(document.activeElement).toBe(screen.getByRole("textbox", { name: "Add an item" }));

    const again = screen.getByRole("textbox", { name: "Title of Hades II" });
    await userEvent.type(again, " oops{Escape}");
    expect(titles(h)).toEqual(["Hades II"]);
    expect(screen.getByRole<HTMLInputElement>("textbox", { name: "Title of Hades II" }).value).toBe(
      "Hades II",
    );
  });

  it("won't save a blank title", async () => {
    const h = await renderShell();
    await makeBucket("Games");
    await type("Hades");
    await userEvent.clear(screen.getByRole("textbox", { name: "Title of Hades" }));
    await userEvent.tab();
    expect(titles(h)).toEqual(["Hades"]);
  });

  it("makes several items from pasted lines", async () => {
    const h = await renderShell();
    await makeBucket("Games");
    await userEvent.click(await screen.findByRole("textbox", { name: "Add an item" }));
    await userEvent.paste("- Hades\n- Celeste\n1. Tunic");
    expect(titles(h)).toEqual(["Hades", "Celeste", "Tunic"]);
    await waitFor(() => {
      expect(live()).toBe("Added 3 items.");
    });
  });

  it("pastes a single line as ordinary text", async () => {
    const h = await renderShell();
    await makeBucket("Games");
    const box = await screen.findByRole("textbox", { name: "Add an item" });
    await userEvent.click(box);
    await userEvent.paste("Just one");
    expect((box as HTMLInputElement).value).toBe("Just one");
    expect(titles(h)).toEqual([]);
  });
});

describe("steps", () => {
  it("Tab turns the typed row into a step of the item above, and Shift-Tab brings it back", async () => {
    const h = await renderShell();
    await makeBucket("Games");
    await type("Hades");
    const box = screen.getByRole("textbox", { name: "Add an item" });
    await userEvent.type(box, "Beat the boss{Tab}");
    expect(bucketOf(h).items[bucketOf(h).itemOrder[0] ?? ""]?.steps.map((s) => s.title)).toEqual([
      "Beat the boss",
    ]);
    expect(screen.getByRole("img", { name: "0 of 1 steps done" })).toBeTruthy();

    const step = screen.getByRole("textbox", { name: "Step: Beat the boss" });
    step.focus();
    await userEvent.keyboard("{Shift>}{Tab}{/Shift}");
    expect(titles(h)).toEqual(["Hades", "Beat the boss"]);
    expect(screen.queryByRole("textbox", { name: "Step: Beat the boss" })).toBeNull();
  });

  it("lets Tab move on when nothing is typed or there is no item above", async () => {
    const h = await renderShell();
    await makeBucket("Games");
    const box = await screen.findByRole("textbox", { name: "Add an item" });
    await userEvent.type(box, "Lonely{Tab}");
    expect(bucketOf(h).itemOrder).toEqual([]);
  });

  it("ticks, renames and removes a step", async () => {
    const h = await renderShell();
    await makeBucket("Games");
    await type("Hades");
    await userEvent.type(screen.getByRole("textbox", { name: "Add an item" }), "Boons{Tab}");
    await userEvent.click(screen.getByRole("checkbox", { name: "Step Boons done" }));
    const item = (): Bucket["items"][string] | undefined =>
      bucketOf(h).items[bucketOf(h).itemOrder[0] ?? ""];
    expect(item()?.steps[0]?.done).toBe(true);
    expect(screen.getByRole("img", { name: "1 of 1 steps done" })).toBeTruthy();

    const input = screen.getByRole("textbox", { name: "Step: Boons" });
    await userEvent.clear(input);
    await userEvent.type(input, "Keepsakes");
    await userEvent.tab();
    expect(item()?.steps[0]?.title).toBe("Keepsakes");

    const renamed = screen.getByRole("textbox", { name: "Step: Keepsakes" });
    await userEvent.clear(renamed);
    await userEvent.keyboard("{Backspace}");
    expect(item()?.steps).toEqual([]);
  });
});

describe("selecting, deleting and moving", () => {
  it("selects with a click, adds with Ctrl-click and extends with Shift-click", async () => {
    await renderShell();
    await makeBucket("Games");
    await type("A", "B", "C", "D");
    await userEvent.click(row("A"));
    expect(row("A").getAttribute("aria-selected")).toBe("true");
    fireEvent.click(row("C"), { ctrlKey: true });
    expect(screen.getByText("2 items selected")).toBeTruthy();
    expect(row("B").getAttribute("aria-selected")).toBe("false");
    fireEvent.click(row("D"), { shiftKey: true });
    expect(screen.getByText("2 items selected")).toBeTruthy();
    // The range runs from the last row clicked (C) to D, replacing the earlier picks.
    expect(row("A").getAttribute("aria-selected")).toBe("false");
    expect(row("C").getAttribute("aria-selected")).toBe("true");
    expect(row("D").getAttribute("aria-selected")).toBe("true");
  });

  it("shows details for one selected item and a count for several", async () => {
    await renderShell();
    await makeBucket("Games");
    await type("A", "B");
    await userEvent.click(row("A"));
    expect(await screen.findByTestId("item-inspector")).toBeTruthy();
    fireEvent.click(row("B"), { ctrlKey: true });
    expect(await screen.findByText("2 items selected.")).toBeTruthy();
  });

  it("deletes the selection after asking, with the Delete key", async () => {
    const h = await renderShell();
    await makeBucket("Games");
    await type("A", "B");
    row("A").focus();
    await userEvent.keyboard("{Delete}");
    const dialog = await screen.findByRole("dialog", { name: "Delete “A”?" });
    await userEvent.click(within(dialog).getByRole("button", { name: "Cancel" }));
    expect(titles(h)).toEqual(["A", "B"]);
    row("A").focus();
    await userEvent.keyboard("{Delete}");
    await userEvent.click(within(await screen.findByRole("dialog")).getByTestId("confirm"));
    expect(titles(h)).toEqual(["B"]);
  });

  it("reorders from the keyboard with Alt and the arrow keys, and announces it", async () => {
    const h = await renderShell();
    await makeBucket("Games");
    await type("A", "B", "C");
    row("B").focus();
    await userEvent.keyboard("{Alt>}{ArrowUp}{/Alt}");
    expect(titles(h)).toEqual(["B", "A", "C"]);
    await waitFor(() => {
      expect(live()).toBe("Moved B up.");
    });
    await userEvent.keyboard("{Alt>}{ArrowDown}{ArrowDown}{/Alt}");
    expect(titles(h)).toEqual(["A", "C", "B"]);
  });

  it("moves focus between rows with the arrow keys", async () => {
    await renderShell();
    await makeBucket("Games");
    await type("A", "B");
    row("A").focus();
    await userEvent.keyboard("{ArrowDown}");
    expect(document.activeElement).toBe(row("B"));
    await userEvent.keyboard("{ArrowUp}");
    expect(document.activeElement).toBe(row("A"));
  });

  it("moves selected items to another bucket from the menu", async () => {
    const h = await renderShell();
    await makeBucket("Games");
    await makeBucket("Chores");
    await userEvent.click(
      screen.getByTestId(`bucket-${h.store.getState().library.bucketOrder[0] ?? ""}`),
    );
    await type("Hades", "Celeste");
    await userEvent.click(row("Hades"));
    await userEvent.selectOptions(
      screen.getByRole("combobox", { name: "Move to bucket" }),
      "Chores",
    );
    expect(titles(h, 0)).toEqual(["Celeste"]);
    expect(titles(h, 1)).toEqual(["Hades"]);
    await waitFor(() => {
      expect(live()).toBe("Moved Hades to Chores.");
    });
  });

  it("explains when an item in a hand can't be moved", async () => {
    const h = await renderShell();
    await makeBucket("Games");
    await makeBucket("Chores");
    await userEvent.click(
      screen.getByTestId(`bucket-${h.store.getState().library.bucketOrder[0] ?? ""}`),
    );
    await type("Hades");
    await userEvent.click(screen.getByTestId("draw"));
    await userEvent.click(row("Hades"));
    await userEvent.selectOptions(
      screen.getByRole("combobox", { name: "Move to bucket" }),
      "Chores",
    );
    expect(titles(h, 0)).toEqual(["Hades"]);
    await waitFor(() => {
      expect(live()).toBe("Finish or toss back Hades before moving it.");
    });
  });
});

describe("dragging", () => {
  it("drops a row before another to reorder", async () => {
    const h = await renderShell();
    await makeBucket("Games");
    await type("A", "B", "C");
    const transfer = dataTransfer();
    fireEvent.dragStart(row("C"), { dataTransfer: transfer });
    fireEvent.dragOver(row("A"), { dataTransfer: transfer });
    fireEvent.drop(row("A"), { dataTransfer: transfer });
    expect(titles(h)).toEqual(["C", "A", "B"]);
  });

  it("drops onto the add row to send items to the end", async () => {
    const h = await renderShell();
    await makeBucket("Games");
    await type("A", "B", "C");
    const transfer = dataTransfer();
    const box = screen.getByRole("textbox", { name: "Add an item" });
    fireEvent.dragStart(row("A"), { dataTransfer: transfer });
    fireEvent.dragOver(box, { dataTransfer: transfer });
    fireEvent.drop(box, { dataTransfer: transfer });
    expect(titles(h)).toEqual(["B", "C", "A"]);
  });

  it("drags every selected row together", async () => {
    const h = await renderShell();
    await makeBucket("Games");
    await type("A", "B", "C", "D");
    await userEvent.click(row("C"));
    fireEvent.click(row("D"), { ctrlKey: true });
    const transfer = dataTransfer();
    fireEvent.dragStart(row("C"), { dataTransfer: transfer });
    fireEvent.drop(row("A"), { dataTransfer: transfer });
    expect(titles(h)).toEqual(["C", "D", "A", "B"]);
  });

  it("moves items to another bucket when dropped on it in the sidebar", async () => {
    const h = await renderShell();
    await makeBucket("Games");
    await makeBucket("Chores");
    const [games = "", chores = ""] = h.store.getState().library.bucketOrder;
    await userEvent.click(screen.getByTestId(`bucket-${games}`));
    await type("Hades");
    const transfer = dataTransfer();
    fireEvent.dragStart(row("Hades"), { dataTransfer: transfer });
    fireEvent.dragOver(screen.getByTestId(`bucket-${chores}`), { dataTransfer: transfer });
    fireEvent.drop(screen.getByTestId(`bucket-${chores}`), { dataTransfer: transfer });
    expect(titles(h, 0)).toEqual([]);
    expect(titles(h, 1)).toEqual(["Hades"]);
  });

  it("ignores drops of things that aren't items, and drops on the same bucket", async () => {
    const h = await renderShell();
    await makeBucket("Games");
    await type("A", "B");
    const files = dataTransfer();
    (files.types as string[]).push("Files");
    fireEvent.drop(row("A"), { dataTransfer: files });
    fireEvent.dragOver(row("A"), { dataTransfer: files });
    const id = h.store.getState().library.bucketOrder[0] ?? "";
    const transfer = dataTransfer();
    fireEvent.dragStart(row("B"), { dataTransfer: transfer });
    fireEvent.drop(screen.getByTestId(`bucket-${id}`), { dataTransfer: transfer });
    expect(titles(h)).toEqual(["A", "B"]);
  });
});

describe("hidden titles", () => {
  it("shows no editable title for a Mystery Bag item until it is drawn", async () => {
    await renderShell();
    await makeBucket("Surprise", /Mystery/);
    await type("Secret");
    expect(screen.queryByRole("textbox", { name: "Title of Secret" })).toBeNull();
    expect(screen.getByText("Hidden until drawn")).toBeTruthy();
  });
});

describe("links", () => {
  async function withItem(): Promise<ShellHarness> {
    const h = await renderShell();
    await makeBucket("Games");
    await type("Hades");
    await userEvent.click(row("Hades"));
    return h;
  }
  const links = (h: ShellHarness): { url: string; title?: string }[] =>
    Object.values(bucketOf(h).items)[0]?.links ?? [];

  it("adds a web link, labels it, copies it and removes it", async () => {
    const h = await withItem();
    const writeText = vi.fn(() => Promise.resolve());
    vi.stubGlobal("navigator", { clipboard: { writeText }, platform: "Win32" });
    await userEvent.type(
      await screen.findByRole("textbox", { name: "Add a link" }),
      "https://example.com/guide{Enter}",
    );
    expect(links(h).map((l) => l.url)).toEqual(["https://example.com/guide"]);
    const anchor = screen.getByRole("link", { name: "Open https://example.com/guide" });
    expect(anchor.getAttribute("rel")).toBe("noopener noreferrer");
    expect(anchor.getAttribute("target")).toBe("_blank");

    await userEvent.type(
      screen.getByRole("textbox", { name: "Label for https://example.com/guide" }),
      "Guide",
    );
    await userEvent.tab();
    expect(links(h)[0]?.title).toBe("Guide");
    await userEvent.click(screen.getByRole("button", { name: "Copy link Guide" }));
    expect(writeText).toHaveBeenCalledWith("https://example.com/guide");
    await userEvent.click(screen.getByRole("button", { name: "Remove link Guide" }));
    expect(links(h)).toEqual([]);
  });

  it("refuses anything that isn't a web or email address", async () => {
    const h = await withItem();
    await userEvent.type(
      await screen.findByRole("textbox", { name: "Add a link" }),
      "javascript:alert(1){Enter}",
    );
    expect(links(h)).toEqual([]);
    expect(screen.getByText("Only web and email addresses can be added.")).toBeTruthy();
  });

  it("turns a pasted address in the notes into a link", async () => {
    const h = await withItem();
    const notes = await screen.findByRole("textbox", { name: "Notes" });
    await userEvent.click(notes);
    await userEvent.paste("https://example.com/pasted");
    expect(links(h).map((l) => l.url)).toEqual(["https://example.com/pasted"]);
    expect((notes as HTMLTextAreaElement).value).toBe("");
    await userEvent.paste("just words");
    expect((notes as HTMLTextAreaElement).value).toBe("just words");
  });
});

describe("images", () => {
  const codec = {
    decode: () => Promise.resolve({ width: 800, height: 600 }),
    encode: (_i: unknown, _w: number, _h: number, type: string) =>
      Promise.resolve(new Blob(["pixels"], { type })),
  };

  async function withItem(): Promise<ShellHarness> {
    const h = await renderShell({ imageCodec: codec });
    await makeBucket("Games");
    await type("Hades");
    await userEvent.click(row("Hades"));
    return h;
  }
  const attachments = (h: ShellHarness) => Object.values(bucketOf(h).items)[0]?.attachments ?? [];

  it("adds a picture from the file picker, asks for a description, and stores it once", async () => {
    const h = await withItem();
    await userEvent.upload(
      await screen.findByTestId("image-file"),
      new File(["x"], "a.png", { type: "image/png" }),
    );
    const dialog = await screen.findByRole("dialog", { name: "Add an image" });
    await userEvent.type(
      within(dialog).getByRole("textbox", { name: "Describe this image" }),
      "A blue bucket",
    );
    await userEvent.tab();
    await userEvent.click(within(dialog).getByTestId("save-image"));
    await waitFor(() => {
      expect(attachments(h)).toHaveLength(1);
    });
    const [a] = attachments(h);
    expect(a).toMatchObject({ mime: "image/png", width: 800, height: 600, alt: "A blue bucket" });
    expect(await h.environment.blobs.has(a?.blobId ?? "")).toBe(true);
    expect(screen.getByRole("img", { name: "1 image" })).toBeTruthy();
  });

  it("can add a picture without a description, and cancel", async () => {
    const h = await withItem();
    const input = await screen.findByTestId("image-file");
    await userEvent.upload(input, new File(["x"], "a.png", { type: "image/png" }));
    await userEvent.click(
      within(await screen.findByRole("dialog")).getByRole("button", { name: "Cancel" }),
    );
    expect(attachments(h)).toEqual([]);
    await userEvent.upload(input, new File(["x"], "b.png", { type: "image/png" }));
    await userEvent.click(within(await screen.findByRole("dialog")).getByTestId("save-image"));
    await waitFor(() => {
      expect(attachments(h)).toHaveLength(1);
    });
    expect(attachments(h)[0]).not.toHaveProperty("alt");
  });

  it("shows a thumbnail, edits the description, opens it larger, and removes it", async () => {
    const h = await withItem();
    await userEvent.upload(
      await screen.findByTestId("image-file"),
      new File(["x"], "a.png", { type: "image/png" }),
    );
    await userEvent.type(within(await screen.findByRole("dialog")).getByRole("textbox"), "Old");
    await userEvent.tab();
    await userEvent.click(screen.getByTestId("save-image"));
    await waitFor(() => {
      expect(attachments(h)).toHaveLength(1);
    });
    const thumb = await screen.findByRole("button", { name: "View larger: Old" });
    await waitFor(() => {
      expect(within(thumb).queryByRole("img")).toBeTruthy();
    });

    const alt = screen.getByRole("textbox", { name: "Description of Old" });
    await userEvent.clear(alt);
    await userEvent.type(alt, "New");
    await userEvent.tab();
    expect(attachments(h)[0]?.alt).toBe("New");

    await userEvent.click(await screen.findByRole("button", { name: "View larger: New" }));
    const lightbox = await screen.findByRole("dialog", { name: "New" });
    await userEvent.click(within(lightbox).getByRole("button", { name: "Close" }));
    await userEvent.click(screen.getByRole("button", { name: "Remove image New" }));
    expect(attachments(h)).toEqual([]);
  });

  it.each([
    [
      new File(["x"], "a.pdf", { type: "application/pdf" }),
      "Buckets can add JPEG, PNG, WebP, GIF or HEIC pictures.",
    ],
  ])("explains why %s was refused", async (file, message) => {
    await withItem();
    // The file input's accept list would filter this in a real browser; drop it instead.
    const section = (await screen.findByText("Images")).closest("fieldset") as HTMLElement;
    fireEvent.drop(section, { dataTransfer: { types: ["Files"], files: [file] } });
    expect(await screen.findByText(message)).toBeTruthy();
  });

  it("takes a picture that is dropped or pasted", async () => {
    const h = await withItem();
    const section = (await screen.findByText("Images")).closest("fieldset") as HTMLElement;
    const png = new File(["x"], "a.png", { type: "image/png" });
    fireEvent.drop(section, { dataTransfer: { types: ["Files"], files: [png] } });
    await userEvent.click(await screen.findByTestId("save-image"));
    await waitFor(() => {
      expect(attachments(h)).toHaveLength(1);
    });
    act(() => {
      fireEvent.paste(section, { clipboardData: { files: [png], getData: () => "" } });
    });
    expect(await screen.findByTestId("save-image")).toBeTruthy();
  });
});

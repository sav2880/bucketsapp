// SPDX-License-Identifier: Apache-2.0

import { expect, test, type Locator, type Page } from "@playwright/test";

/** A 1×1 PNG, enough to go through the whole picture pipeline. */
const PNG = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==",
  "base64",
);

async function createBucket(page: Page, name: string, preset = /Grab/): Promise<void> {
  await page.getByRole("button", { name: "New bucket" }).first().click();
  const dialog = page.getByRole("dialog", { name: "New bucket" });
  await dialog.getByRole("textbox", { name: "Name" }).fill(name);
  await dialog.getByRole("radio", { name: preset }).check();
  await dialog.getByRole("button", { name: "Create" }).click();
  await expect(page.getByRole("heading", { name, level: 1 })).toBeVisible();
}

async function typeItems(page: Page, ...titles: string[]): Promise<void> {
  const box = page.getByRole("textbox", { name: "Add an item" });
  for (const title of titles) {
    await box.fill(title);
    await box.press("Enter");
    await expect(page.getByRole("textbox", { name: `Title of ${title}` })).toBeVisible();
  }
}

const rowOf = (page: Page, title: string): Locator =>
  page.getByRole("row").filter({ has: page.getByRole("textbox", { name: `Title of ${title}` }) });

/** Item titles in the order the list shows them. */
const order = (page: Page): Promise<string[]> =>
  page
    .getByRole("textbox", { name: /^Title of / })
    .evaluateAll((boxes) => boxes.map((b) => (b as HTMLInputElement).value));

test.beforeEach(async ({ page }) => {
  await page.goto("/");
  await expect(page.getByTestId("shell")).toBeVisible();
});

test("creates a bucket and adds items by typing", async ({ page }) => {
  await createBucket(page, "Games");
  await typeItems(page, "Hades", "Celeste");
  expect(await order(page)).toEqual(["Hades", "Celeste"]);
});

test("adds one item for every pasted line", async ({ page }) => {
  await createBucket(page, "Games");
  const box = page.getByRole("textbox", { name: "Add an item" });
  await box.focus();
  await box.evaluate((input) => {
    const data = new DataTransfer();
    data.setData("text/plain", "- Hades\n- Celeste\n- Tunic");
    input.dispatchEvent(
      new ClipboardEvent("paste", { clipboardData: data, bubbles: true, cancelable: true }),
    );
  });
  await expect.poll(() => order(page)).toEqual(["Hades", "Celeste", "Tunic"]);
});

test("Tab makes a step, and ticking it moves the progress", async ({ page }) => {
  await createBucket(page, "Games");
  await typeItems(page, "Hades");
  const box = page.getByRole("textbox", { name: "Add an item" });
  await box.fill("Beat the boss");
  await box.press("Tab");
  await expect(page.getByRole("img", { name: "0 of 1 steps done" })).toBeVisible();
  await page.getByRole("checkbox", { name: "Step Beat the boss done" }).check();
  await expect(page.getByRole("img", { name: "1 of 1 steps done" })).toBeVisible();
});

test("reorders with the keyboard", async ({ page }) => {
  await createBucket(page, "Games");
  await typeItems(page, "Hades", "Celeste", "Tunic");
  await rowOf(page, "Tunic").click({ position: { x: 4, y: 4 } });
  await rowOf(page, "Tunic").press("Alt+ArrowUp");
  await expect.poll(() => order(page)).toEqual(["Hades", "Tunic", "Celeste"]);
});

test("moves an item to another bucket", async ({ page }) => {
  await createBucket(page, "Games");
  await createBucket(page, "Books");
  await page.getByRole("button", { name: /Games/ }).first().click();
  await typeItems(page, "Hades");
  await rowOf(page, "Hades").click({ position: { x: 4, y: 4 } });
  await page.getByRole("combobox", { name: "Move this item" }).selectOption({ label: "Books" });
  await expect(page.getByRole("textbox", { name: "Title of Hades" })).toHaveCount(0);
  await page.getByRole("button", { name: /Books/ }).first().click();
  await expect(page.getByRole("textbox", { name: "Title of Hades" })).toBeVisible();
});

test("adds a picture with a description, and keeps everything after a reload", async ({ page }) => {
  await createBucket(page, "Games");
  await typeItems(page, "Hades");
  await rowOf(page, "Hades").click({ position: { x: 4, y: 4 } });
  await page
    .getByTestId("image-file")
    .setInputFiles({ name: "dot.png", mimeType: "image/png", buffer: PNG });
  await page.getByRole("textbox", { name: "Describe this image" }).fill("A single dot");
  await page.getByRole("button", { name: "Add image" }).click();
  await expect(page.getByRole("button", { name: "Remove image A single dot" })).toBeVisible();

  // Saving is debounced; leaving the page flushes it, as closing the window does.
  await page.evaluate(() => {
    window.dispatchEvent(new Event("pagehide"));
  });
  await page.reload();
  await expect(page.getByRole("heading", { name: "Games", level: 1 })).toBeVisible();
  await rowOf(page, "Hades").click({ position: { x: 4, y: 4 } });
  await expect(page.getByRole("button", { name: "Remove image A single dot" })).toBeVisible();
});

test("draws an item, finishes it, and tosses another back", async ({ page }) => {
  await createBucket(page, "Games");
  await typeItems(page, "Hades");
  await page.getByTestId("draw").click();
  await expect(page.getByTestId("notice")).toContainText("Hades");
  await page.getByTestId("done").click();
  await expect(page.getByTestId("notice")).toContainText("Finished Hades");

  await typeItems(page, "Celeste");
  await page.getByTestId("draw").click();
  await page.getByTestId("toss-back").click();
  const confirm = page.getByRole("dialog");
  if (await confirm.isVisible()) await confirm.getByRole("button", { name: "Toss back" }).click();
  await expect(page.getByTestId("notice")).toContainText("Tossed back Celeste");
});

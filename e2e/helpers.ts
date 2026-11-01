// SPDX-License-Identifier: Apache-2.0

import { expect, type Locator, type Page } from "@playwright/test";

/**
 * Makes a bucket through the New bucket dialog, as a person would.
 *
 * @param page - The page.
 * @param name - The bucket's name.
 * @param preset - Matches the label of the type to pick.
 */
export async function createBucket(page: Page, name: string, preset = /Grab/): Promise<void> {
  await page.getByRole("button", { name: "New bucket" }).first().click();
  const dialog = page.getByRole("dialog", { name: "New bucket" });
  await dialog.getByRole("textbox", { name: "Name" }).fill(name);
  await dialog.getByRole("radio", { name: preset }).check();
  await dialog.getByRole("button", { name: "Create" }).click();
  await expect(page.getByRole("heading", { name, level: 1 })).toBeVisible();
}

/**
 * Adds items one at a time by typing and pressing Return, waiting for each to appear.
 *
 * @param page - The page.
 * @param titles - The items, in order.
 */
export async function typeItems(page: Page, ...titles: string[]): Promise<void> {
  const box = page.getByRole("textbox", { name: "Add an item" });
  for (const title of titles) {
    await box.fill(title);
    await box.press("Enter");
    await expect(page.getByRole("textbox", { name: `Title of ${title}` })).toBeVisible();
  }
}

/**
 * The list row holding an item.
 *
 * @param page - The page.
 * @param title - The item's title.
 * @returns A locator for the row.
 */
export const rowOf = (page: Page, title: string): Locator =>
  page.getByRole("row").filter({ has: page.getByRole("textbox", { name: `Title of ${title}` }) });

/**
 * Item titles in the order the list shows them.
 *
 * @param page - The page.
 * @returns The titles.
 */
export const order = (page: Page): Promise<string[]> =>
  page
    .getByRole("textbox", { name: /^Title of / })
    .evaluateAll((boxes) => boxes.map((b) => (b as HTMLInputElement).value));

/**
 * Pastes lines into the "Add an item" box, one item per line.
 *
 * @param page - The page.
 * @param lines - The text to paste, one line per item.
 */
export async function pasteItems(page: Page, lines: readonly string[]): Promise<void> {
  const box = page.getByRole("textbox", { name: "Add an item" });
  await box.focus();
  await box.evaluate((input, text) => {
    const data = new DataTransfer();
    data.setData("text/plain", text);
    // Firefox ignores `clipboardData` in the ClipboardEvent constructor, so attach it afterwards.
    const event = new Event("paste", { bubbles: true, cancelable: true });
    Object.defineProperty(event, "clipboardData", { value: data });
    input.dispatchEvent(event);
  }, lines.join("\n"));
}

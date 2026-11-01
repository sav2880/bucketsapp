// SPDX-License-Identifier: Apache-2.0

import { expect, test, type Page } from "@playwright/test";
import { createBucket, pasteItems } from "./helpers";

const COUNT = 500;

/**
 * Makes a bucket with 500 items.
 *
 * @param page - The page.
 */
async function bigBucket(page: Page): Promise<void> {
  await page.goto("/");
  await createBucket(page, "Big");
  await pasteItems(
    page,
    Array.from({ length: COUNT }, (_, i) => `Item ${String(i + 1)}`),
  );
  await expect(page.getByTestId("columns")).toHaveAttribute("aria-rowcount", String(COUNT + 1), {
    timeout: 20_000,
  });
}

/**
 * How many item rows are in the page right now.
 *
 * @param page - The page.
 * @returns The count.
 */
const drawn = (page: Page): Promise<number> => page.locator('[data-testid^="item-"]').count();

/**
 * Scrolls the bucket pane.
 *
 * @param page - The page.
 * @param to - A position in pixels, or `"end"`.
 */
async function scrollPane(page: Page, to: number | "end"): Promise<void> {
  await page.locator("main").evaluate((el, target) => {
    el.scrollTo(0, target === "end" ? el.scrollHeight : target);
  }, to);
}

test("only the rows near the screen are drawn", async ({ page }) => {
  await bigBucket(page);
  expect(await drawn(page)).toBeLessThan(80);
  await expect(page.getByRole("textbox", { name: "Title of Item 1", exact: true })).toBeVisible();
  await expect(
    page.getByRole("textbox", { name: `Title of Item ${String(COUNT)}`, exact: true }),
  ).toHaveCount(0);
});

test("scrolling brings the other rows into view", async ({ page }) => {
  await bigBucket(page);
  await scrollPane(page, "end");
  await expect(
    page.getByRole("textbox", { name: `Title of Item ${String(COUNT)}`, exact: true }),
  ).toBeVisible();
  await expect(page.getByRole("textbox", { name: "Title of Item 1", exact: true })).toHaveCount(0);
  expect(await drawn(page)).toBeLessThan(80);
  // The add box is below the last row, still reachable.
  await expect(page.getByRole("textbox", { name: "Add an item" })).toBeVisible();
});

test("arrow keys carry on past the rows that are drawn", async ({ page }) => {
  await bigBucket(page);
  await page
    .getByTestId(/^item-/)
    .first()
    .focus();
  for (let i = 0; i < 60; i += 1) await page.keyboard.press("ArrowDown");
  // 60 presses from the first row land on the 61st, which was not drawn at the start.
  const active = page.locator(":focus");
  await expect(active.getByRole("textbox")).toHaveValue("Item 61");
  await expect(active).toBeInViewport();
});

test("a selection can span rows that are not on screen", async ({ page }) => {
  await bigBucket(page);
  await page
    .getByRole("row")
    .filter({ has: page.getByRole("textbox", { name: "Title of Item 1", exact: true }) })
    .click({ position: { x: 4, y: 4 } });
  await scrollPane(page, "end");
  await page
    .getByRole("row")
    .filter({
      has: page.getByRole("textbox", { name: `Title of Item ${String(COUNT)}`, exact: true }),
    })
    .click({ position: { x: 4, y: 4 }, modifiers: ["Shift"] });
  await expect(page.getByText(`${String(COUNT)} items selected`).first()).toBeVisible();
});

test("editing and adding still work in a long list", async ({ page }) => {
  await bigBucket(page);
  await scrollPane(page, "end");
  const last = page.getByRole("textbox", { name: `Title of Item ${String(COUNT)}`, exact: true });
  await last.fill("The very last");
  await last.press("Enter");
  await expect(page.getByRole("textbox", { name: "Title of The very last" })).toBeVisible();
  const add = page.getByRole("textbox", { name: "Add an item" });
  await add.fill("One more");
  await add.press("Enter");
  await expect(page.getByTestId("columns")).toHaveAttribute("aria-rowcount", String(COUNT + 2));
  await scrollPane(page, "end");
  await expect(page.getByRole("textbox", { name: "Title of One more" })).toBeVisible();
});

test("an item with steps takes the room it needs and doesn't overlap the next", async ({
  page,
}) => {
  await bigBucket(page);
  const add = page.getByRole("textbox", { name: "Add an item" });
  // A step is added to the last item, which makes its group taller.
  await add.fill("A step");
  await add.press("Tab");
  await expect(page.getByTestId("columns")).toHaveAttribute("aria-rowcount", String(COUNT + 2));
  await scrollPane(page, "end");
  // Newly drawn rows are placed from a guess and corrected once measured, a moment later.
  await expect
    .poll(async () => {
      const boxes = await page.locator("[data-item-id]").evaluateAll((groups) =>
        groups
          .map((g) => g.getBoundingClientRect())
          .sort((a, b) => a.top - b.top)
          .map((r) => ({ top: r.top, bottom: r.bottom })),
      );
      if (boxes.length < 5) return false;
      return boxes.every((box, i) => i === 0 || (boxes[i - 1]?.bottom ?? 0) <= box.top + 1);
    })
    .toBe(true);
});

test("a row being edited stays when it is scrolled out of view, and saves", async ({ page }) => {
  await bigBucket(page);
  const first = page.getByRole("textbox", { name: "Title of Item 1", exact: true });
  await first.click();
  await first.fill("Edited title");
  await scrollPane(page, "end");
  // It has focus, so it stays drawn (just off screen) and what was typed isn't lost.
  await expect(
    page.locator('[data-testid^="item-"] input[aria-label="Title of Item 1"]'),
  ).toHaveCount(1);
  // Clicking elsewhere saves the title, even though the row is far from view.
  await page.getByRole("textbox", { name: "Add an item" }).click();
  await scrollPane(page, 0);
  await expect(page.getByRole("textbox", { name: "Title of Edited title" })).toBeVisible();
});

test("a short list is drawn in full", async ({ page }) => {
  await page.goto("/");
  await createBucket(page, "Small");
  await pasteItems(page, ["a", "b", "c"]);
  await expect(page.getByRole("textbox", { name: /^Title of / })).toHaveCount(3);
});

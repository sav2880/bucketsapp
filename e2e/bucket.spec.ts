// SPDX-License-Identifier: Apache-2.0

import { expect, test, type Page } from "@playwright/test";
import { createBucket, pasteItems, typeItems } from "./helpers";

/**
 * The card of the item in hand.
 *
 * @param page - The page.
 * @returns A locator for it.
 */
const card = (page: Page) => page.getByTestId(/^hand-/);

/**
 * Counts the floating slips and card copies that appear, so a test can tell if anything flew.
 *
 * @param page - The page; call before it loads.
 */
async function watchFlights(page: Page): Promise<void> {
  await page.addInitScript(() => {
    const seen = { slips: 0, ghosts: 0 };
    Object.assign(window, { __flights: seen });
    new MutationObserver((records) => {
      for (const record of records)
        for (const node of record.addedNodes) {
          if (!(node instanceof HTMLElement)) continue;
          if (node.classList.contains("bk-flying-slip")) seen.slips += 1;
          if (node.classList.contains("bk-ghost")) seen.ghosts += 1;
        }
    }).observe(document, { childList: true, subtree: true });
  });
}

/**
 * How many slips and card copies have floated so far.
 *
 * @param page - The page.
 * @returns The counts.
 */
const flights = (page: Page): Promise<{ slips: number; ghosts: number }> =>
  page.evaluate(
    () => (window as unknown as { __flights: { slips: number; ghosts: number } }).__flights,
  );

/**
 * Waits until the card is fully shown and nothing is still floating.
 *
 * @param page - The page.
 */
async function settled(page: Page): Promise<void> {
  await expect
    .poll(
      () =>
        page.evaluate(() => {
          const c = document.querySelector("[data-testid^=hand-]");
          return {
            visible: c !== null && getComputedStyle(c).opacity === "1" && !c.hasAttribute("inert"),
            floating: document.querySelectorAll(".bk-flying-slip, .bk-ghost").length,
          };
        }),
      { timeout: 4000 },
    )
    .toEqual({ visible: true, floating: 0 });
}

test.beforeEach(async ({ page }) => {
  await watchFlights(page);
  await page.goto("/");
  await expect(page.getByTestId("shell")).toBeVisible();
});

test.describe("with motion", () => {
  test("a draw flies a slip to a card and leaves everything usable", async ({ page }) => {
    await createBucket(page, "Games");
    await typeItems(page, "Hades");
    await page.getByTestId("draw").click();
    await expect(page.getByTestId("notice")).toContainText("Hades");
    await settled(page);
    expect((await flights(page)).slips).toBe(1);
    await expect(page.getByTestId("draw")).toHaveAttribute("aria-disabled", "true");
    await expect(page.getByTestId("bucket-lid")).toHaveClass(/\bon\b/);
  });

  test("finishing sends a copy of the card to the done pile and clears up", async ({ page }) => {
    await createBucket(page, "Games");
    await typeItems(page, "Hades");
    await page.getByTestId("draw").click();
    await settled(page);
    await page.getByTestId("done").click();
    await expect(page.getByTestId("notice")).toContainText("Finished Hades");
    await expect.poll(() => page.locator(".bk-ghost").count(), { timeout: 4000 }).toBe(0);
    expect((await flights(page)).ghosts).toBe(1);
    await expect(page.getByTestId("done-pile")).toContainText("1");
    await expect(page.getByTestId("draw")).toHaveAttribute("aria-disabled", "true");
  });

  test("tossing back returns the card to the bucket", async ({ page }) => {
    await createBucket(page, "Games", /Rotation/);
    await typeItems(page, "Hades");
    await page.getByTestId("draw").click();
    await settled(page);
    await page.getByTestId("toss-back").click();
    const confirm = page.getByRole("dialog");
    if (await confirm.isVisible()) await confirm.getByRole("button", { name: "Toss back" }).click();
    await expect(page.getByTestId("notice")).toContainText("Tossed back Hades");
    await expect.poll(() => page.locator(".bk-ghost").count(), { timeout: 4000 }).toBe(0);
    await expect(card(page)).toHaveCount(0);
    await expect(page.getByTestId("draw")).toHaveAttribute("aria-disabled", "false");
  });

  test("a refused draw keeps the lid on and says why", async ({ page }) => {
    await createBucket(page, "Games");
    await typeItems(page, "Hades", "Celeste");
    await page.getByTestId("draw").click();
    await settled(page);
    // The button looks off (aria-disabled) but can still be pressed, and pressing it explains.
    await page.getByTestId("draw").click({ force: true });
    await expect(page.getByTestId("notice")).toContainText(/Finish or toss back (Hades|Celeste)/);
    await expect(page.getByTestId("bucket-lid")).toHaveClass(/\bon\b/);
    await expect(card(page)).toHaveCount(1);
  });

  test("a Mystery Bag keeps the title hidden until the card has flipped", async ({ page }) => {
    await createBucket(page, "Secrets", /Mystery/);
    // Titles are hidden in the list too, so wait for the count instead of the title.
    const box = page.getByRole("textbox", { name: "Add an item" });
    await box.fill("Surprise");
    await box.press("Enter");
    await expect(page.getByText("1 folded slip inside. No peeking.")).toBeVisible();
    await page.getByTestId("draw").click();
    // Straight away the card exists but can't be read or reached.
    await expect(card(page)).toHaveAttribute("inert", "");
    await settled(page);
    await expect(card(page).getByRole("button", { name: "Surprise" })).toBeVisible();
    expect(
      await card(page)
        .locator("h3")
        .evaluate((el) => getComputedStyle(el).color),
    ).not.toBe("rgba(0, 0, 0, 0)");
  });

  test("the explanation shows on keyboard focus but not after a mouse click", async ({
    page,
    browserName,
  }) => {
    // Safari doesn't Tab onto buttons unless a system setting is on.
    test.skip(browserName === "webkit", "WebKit does not Tab to buttons by default");
    await createBucket(page, "Games");
    await typeItems(page, "Hades");
    await page.getByTestId("draw").click();
    await settled(page);
    await expect(page.getByTestId("bucket-tooltip")).toHaveCount(0);

    await page.getByRole("textbox", { name: "Add an item" }).focus();
    for (let i = 0; i < 40; i += 1) {
      await page.keyboard.press("Shift+Tab");
      if (await page.getByTestId("draw").evaluate((el) => el === document.activeElement)) break;
    }
    await expect(page.getByTestId("draw")).toBeFocused();
    await expect(page.getByTestId("bucket-tooltip")).toHaveAttribute(
      "data-text",
      /Finish or toss back Hades/,
    );
    await page.keyboard.press("Escape");
    await expect(page.getByTestId("bucket-tooltip")).toHaveCount(0);
  });

  test("the explanation shows when the pointer is over the bucket", async ({ page }) => {
    await createBucket(page, "Games");
    await typeItems(page, "Hades");
    await page.getByTestId("draw").click();
    await settled(page);
    await page.getByTestId("bucket-art").hover();
    await expect(page.getByTestId("bucket-tooltip")).toHaveAttribute(
      "data-text",
      /Finish or toss back Hades/,
    );
  });

  test("a bucket with 500 items still draws and animates", async ({ page }) => {
    test.setTimeout(60_000);
    await createBucket(page, "Big");
    await pasteItems(
      page,
      Array.from({ length: 500 }, (_, i) => `Item ${String(i + 1)}`),
    );
    await expect(page.getByRole("textbox", { name: /^Title of / })).toHaveCount(500, {
      timeout: 20_000,
    });
    await page.getByTestId("draw").click();
    await settled(page);
    expect((await flights(page)).slips).toBe(1);
  });
});

test.describe("with reduced motion", () => {
  test.use({ reducedMotion: "reduce" });

  test("nothing flies; the card just appears", async ({ page }) => {
    await createBucket(page, "Games");
    await typeItems(page, "Hades");
    await page.getByTestId("draw").click();
    await settled(page);
    await page.getByTestId("done").click();
    await expect(page.getByTestId("notice")).toContainText("Finished Hades");
    await expect.poll(() => page.locator(".bk-ghost").count(), { timeout: 2000 }).toBe(0);
    expect((await flights(page)).slips).toBe(0);
    await expect(page.getByTestId("bucket-art")).toHaveAttribute("data-reduced", "");
  });

  test("the card is there quickly", async ({ page }) => {
    await createBucket(page, "Games");
    await typeItems(page, "Hades");
    await page.getByTestId("draw").click();
    await expect
      .poll(() => card(page).evaluate((el) => getComputedStyle(el).opacity), { timeout: 800 })
      .toBe("1");
  });
});

test("the in-app setting can reduce motion when the system allows it", async ({ page }) => {
  await createBucket(page, "Games");
  await page.getByRole("button", { name: "Bucket", exact: true }).click();
  await page.getByRole("combobox", { name: "Motion" }).selectOption("reduce");
  await expect(page.getByTestId("bucket-art")).toHaveAttribute("data-reduced", "");
  await typeItems(page, "Hades");
  await page.getByTestId("draw").click();
  await settled(page);
  expect((await flights(page)).slips).toBe(0);
});

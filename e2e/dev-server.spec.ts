// SPDX-License-Identifier: Apache-2.0

import { expect, test } from "@playwright/test";

// Regression guard: under the dev server Automerge once threw a WebAssembly exception while
// starting, leaving a blank window in `pnpm dev:desktop` while the production build worked.
test("the dev server starts the app and keeps what you add", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));

  await page.goto("http://localhost:5173/");
  await expect(page.getByTestId("shell")).toBeVisible();

  await page.getByRole("button", { name: "New bucket" }).first().click();
  const dialog = page.getByRole("dialog", { name: "New bucket" });
  await dialog.getByRole("textbox", { name: "Name" }).fill("Games");
  await dialog.getByRole("button", { name: "Create" }).click();
  const box = page.getByRole("textbox", { name: "Add an item" });
  await box.fill("Hades");
  await box.press("Enter");
  await expect(page.getByRole("textbox", { name: "Title of Hades" })).toBeVisible();

  await page.evaluate(() => {
    window.dispatchEvent(new Event("pagehide"));
  });
  await page.reload();
  await expect(page.getByRole("textbox", { name: "Title of Hades" })).toBeVisible();
  expect(errors).toEqual([]);
});

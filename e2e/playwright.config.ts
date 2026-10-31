// SPDX-License-Identifier: Apache-2.0

import { defineConfig, devices } from "@playwright/test";

// Runs against the production build of the web app (`pnpm test:e2e` builds it first), on the
// three engines plan.md §14 names. Each test gets a fresh browser profile, so storage starts empty.
export default defineConfig({
  testDir: ".",
  testMatch: "*.spec.ts",
  fullyParallel: true,
  forbidOnly: Boolean(process.env["CI"]),
  retries: process.env["CI"] ? 1 : 0,
  reporter: process.env["CI"] ? [["github"], ["list"]] : "list",
  use: { baseURL: "http://localhost:4173", trace: "retain-on-failure" },
  webServer: {
    command: "pnpm --filter @buckets/web preview",
    url: "http://localhost:4173",
    reuseExistingServer: !process.env["CI"],
  },
  projects: [
    { name: "chromium", use: { ...devices["Desktop Chrome"] } },
    { name: "webkit", use: { ...devices["Desktop Safari"] } },
    { name: "firefox", use: { ...devices["Desktop Firefox"] } },
  ],
});

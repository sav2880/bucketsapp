// SPDX-License-Identifier: Apache-2.0

import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    // Two environments: UI code runs under jsdom so Testing Library can render it; everything else
    // stays in plain Node so the pure packages cannot lean on DOM globals by accident.
    projects: [
      {
        extends: true,
        test: {
          name: "node",
          environment: "node",
          include: [
            "packages/*/src/**/*.test.ts",
            "packages/*/test/**/*.test.ts",
            "apps/*/src/**/*.test.ts",
            "scripts/**/*.test.ts",
          ],
          exclude: ["packages/ui/**", "**/node_modules/**"],
        },
      },
      {
        extends: true,
        test: {
          name: "dom",
          environment: "jsdom",
          include: ["packages/ui/src/**/*.test.{ts,tsx}", "apps/*/src/**/*.test.tsx"],
          setupFiles: ["./vitest.setup.dom.ts"],
        },
      },
    ],
    coverage: {
      provider: "v8",
      include: ["packages/*/src/**", "apps/*/src/**", "scripts/**"],
      // run-rust-checks.ts only shells out to cargo; it is exercised by `pnpm check` itself.
      exclude: [
        "**/*.test.{ts,tsx}",
        // Shared test helpers (for example core's chi-square statistics).
        "packages/*/test/**",
        "scripts/run-rust-checks.ts",
        // Browser entry point: only wires App into the DOM.
        "apps/desktop/src/main.tsx",
        "apps/web/src/main.tsx",
      ],
      // plan.md §14: core and crypto ≥ 95% lines; everything else ≥ 80%.
      thresholds: {
        lines: 80,
        "packages/core/**": { lines: 95 },
        "packages/crypto/**": { lines: 95 },
      },
    },
  },
});

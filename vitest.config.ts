// SPDX-License-Identifier: Apache-2.0

import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: [
      "packages/*/src/**/*.test.ts",
      "packages/*/src/**/*.test.tsx",
      "packages/*/test/**/*.test.ts",
      "apps/*/src/**/*.test.ts",
      "apps/*/src/**/*.test.tsx",
      "scripts/**/*.test.ts",
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

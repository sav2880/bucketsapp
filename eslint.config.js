// SPDX-License-Identifier: Apache-2.0

import js from "@eslint/js";
import jsdoc from "eslint-plugin-jsdoc";
import jsxA11y from "eslint-plugin-jsx-a11y";
import reactHooks from "eslint-plugin-react-hooks";
import tseslint from "typescript-eslint";

/** Internal packages, used to build the import-direction rules (plan.md §4, AGENTS.md §2). */
const INTERNAL = ["core", "crypto", "storage", "sync", "export", "ui"];

/**
 * Builds a `no-restricted-imports` rule that forbids every internal package except the
 * ones in `allowed`. Client code may never import from `server/` or from an app.
 * @param {string[]} allowed - Internal package names this workspace may import.
 * @param {{ allowApps?: boolean }} [options] - Set `allowApps` for the apps themselves.
 * @returns {import("eslint").Linter.RuleEntry} The rule entry.
 */
function importRule(allowed, options = {}) {
  const forbidden = INTERNAL.filter((name) => !allowed.includes(name));
  const patterns = [
    {
      group: ["../**/server", "../**/server/**"],
      message: "Client code must never import from server/ (plan.md §14).",
    },
  ];
  if (forbidden.length > 0) {
    patterns.push({
      group: forbidden.flatMap((name) => [`@buckets/${name}`, `@buckets/${name}/*`]),
      message: "This import breaks the package direction in plan.md §4.",
    });
  }
  if (!options.allowApps) {
    patterns.push({
      group: ["@buckets/web", "@buckets/desktop", "**/apps/**"],
      message: "Nothing imports from an app (AGENTS.md §2).",
    });
  }
  return ["error", { patterns }];
}

export default tseslint.config(
  {
    ignores: [
      "**/node_modules/**",
      "**/dist/**",
      "**/coverage/**",
      "**/target/**",
      "**/src-tauri/gen/**",
      "prototype/**",
    ],
  },
  js.configs.recommended,
  {
    files: ["**/*.{ts,tsx}"],
    extends: [...tseslint.configs.strictTypeChecked],
    languageOptions: {
      parserOptions: { projectService: true, tsconfigRootDir: import.meta.dirname },
    },
    plugins: { jsdoc },
    rules: {
      "no-restricted-properties": [
        "error",
        {
          object: "Math",
          property: "random",
          message: "Use the Rng interface in packages/core/src/random/ (AGENTS.md rule 6).",
        },
      ],
      "no-restricted-syntax": [
        "error",
        {
          selector: "ExportDefaultDeclaration",
          message: "Use named exports only (AGENTS.md §4).",
        },
      ],
      "jsdoc/require-jsdoc": [
        "error",
        {
          publicOnly: true,
          require: {
            FunctionDeclaration: true,
            ClassDeclaration: true,
          },
          contexts: [
            "TSInterfaceDeclaration",
            "TSTypeAliasDeclaration",
            "TSEnumDeclaration",
            "VariableDeclaration",
          ],
        },
      ],
      "jsdoc/require-description": "error",
    },
  },
  {
    files: ["**/*.tsx"],
    extends: [reactHooks.configs.flat.recommended, jsxA11y.flatConfigs.recommended],
  },
  // Import direction: apps → ui → (storage, sync, export) → core; crypto stands alone.
  { files: ["packages/core/**"], rules: { "no-restricted-imports": importRule([]) } },
  { files: ["packages/crypto/**"], rules: { "no-restricted-imports": importRule([]) } },
  {
    files: ["packages/storage/**", "packages/sync/**"],
    rules: { "no-restricted-imports": importRule(["core", "crypto"]) },
  },
  { files: ["packages/export/**"], rules: { "no-restricted-imports": importRule(["core"]) } },
  {
    files: ["packages/ui/**"],
    rules: {
      "no-restricted-imports": importRule(["core", "crypto", "storage", "sync", "export"]),
    },
  },
  {
    files: ["apps/**"],
    rules: {
      "no-restricted-imports": importRule(INTERNAL, { allowApps: true }),
    },
  },
  {
    files: ["scripts/**"],
    rules: { "no-restricted-imports": "off" },
  },
  // Config files: framework requires default exports, and they are plain JS.
  {
    files: ["**/*.config.{js,ts}"],
    rules: { "no-restricted-syntax": "off", "jsdoc/require-jsdoc": "off" },
  },
  {
    files: ["**/*.js"],
    extends: [tseslint.configs.disableTypeChecked],
  },
);

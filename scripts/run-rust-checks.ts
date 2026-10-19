// SPDX-License-Identifier: Apache-2.0

import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const manifest = resolve(root, "apps/desktop/src-tauri/Cargo.toml");

// The Tauri crate arrives in M0 slice 2. Until then there is no Rust to check,
// and saying so is more honest than a silent pass.
if (!existsSync(manifest)) {
  console.log("Rust: no crate yet (apps/desktop/src-tauri arrives in M0 slice 2); skipped.");
  process.exit(0);
}

const steps: [string, string[]][] = [
  ["cargo", ["fmt", "--check", "--manifest-path", manifest]],
  ["cargo", ["clippy", "--manifest-path", manifest, "--", "-D", "warnings"]],
  ["cargo", ["test", "--manifest-path", manifest]],
  // Licenses, advisories and sources (plan.md §14); policy lives in src-tauri/deny.toml.
  ["cargo", ["deny", "--manifest-path", manifest, "check"]],
];

// `cargo deny` is a separate install; say how to get it instead of a bare cargo error.
if (spawnSync("cargo", ["deny", "--version"], { stdio: "ignore" }).status !== 0) {
  console.error("cargo-deny is missing. Install it with: cargo install --locked cargo-deny");
  process.exit(1);
}

for (const [command, args] of steps) {
  const result = spawnSync(command, args, { stdio: "inherit" });
  if (result.error) {
    console.error(`Could not run ${command}: ${result.error.message}. Install Rust via rustup.`);
    process.exit(1);
  }
  if (result.status !== 0) process.exit(result.status ?? 1);
}
console.log("Rust OK");

// SPDX-License-Identifier: Apache-2.0

import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

// Tauri expects a fixed port and must not trigger rebuilds from Rust output.
export default defineConfig({
  plugins: [react()],
  clearScreen: false,
  server: {
    port: 1420,
    strictPort: true,
    watch: { ignored: ["**/src-tauri/**"] },
  },
});

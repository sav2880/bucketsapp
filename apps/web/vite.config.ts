// SPDX-License-Identifier: Apache-2.0

import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

export default defineConfig({
  plugins: [react()],
  // Automerge starts its WebAssembly itself; pre-bundling it makes startup throw in dev.
  optimizeDeps: { exclude: ["@automerge/automerge"] },
  server: { port: 5173, strictPort: true },
  preview: { port: 4173, strictPort: true },
});

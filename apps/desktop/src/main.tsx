// SPDX-License-Identifier: Apache-2.0

import { AppRoot } from "@buckets/ui";
import "@buckets/ui/src/styles/app.css";
import { createTauriStorage } from "@buckets/storage";
import { invoke } from "@tauri-apps/api/core";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";

const container = document.getElementById("root");
if (!container) throw new Error("Missing #root element in index.html");

// Files in the app data folder, written atomically by the Rust commands (plan.md §8.2).
const storage = createTauriStorage(invoke);

createRoot(container).render(
  <StrictMode>
    <AppRoot storage={storage} />
  </StrictMode>,
);

// SPDX-License-Identifier: Apache-2.0

import { AppRoot } from "@buckets/ui";
import "@buckets/ui/src/styles/app.css";
import { createIndexedDbStorage } from "@buckets/storage";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";

const container = document.getElementById("root");
if (!container) throw new Error("Missing #root element in index.html");

// Everything lives in this browser's IndexedDB; there is no server in M2 (plan.md §8.1).
const storage = createIndexedDbStorage(indexedDB);

createRoot(container).render(
  <StrictMode>
    <AppRoot storage={storage} />
  </StrictMode>,
);

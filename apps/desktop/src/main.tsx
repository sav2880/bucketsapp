// SPDX-License-Identifier: Apache-2.0

import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { App } from "./App";

const container = document.getElementById("root");
if (!container) throw new Error("Missing #root element in index.html");

const theme = window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
createRoot(container).render(
  <StrictMode>
    <App theme={theme} />
  </StrictMode>,
);

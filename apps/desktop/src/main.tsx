// SPDX-License-Identifier: Apache-2.0

import { StrictMode, useSyncExternalStore } from "react";
import type { ReactElement } from "react";
import { createRoot } from "react-dom/client";
import { App } from "./App";
import { createSchemeStore } from "./color-scheme";

const container = document.getElementById("root");
if (!container) throw new Error("Missing #root element in index.html");

const schemeStore = createSchemeStore(window.matchMedia("(prefers-color-scheme: dark)"));

/**
 * Follows the system light or dark setting live, including changes while the app is open.
 * @returns The app in the current theme.
 */
function Root(): ReactElement {
  const theme = useSyncExternalStore(schemeStore.subscribe, schemeStore.getSnapshot);
  return <App theme={theme} />;
}

createRoot(container).render(
  <StrictMode>
    <Root />
  </StrictMode>,
);

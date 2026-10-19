// SPDX-License-Identifier: Apache-2.0

import { cssVariables, strings } from "@buckets/ui";
import type { CSSProperties, ReactElement } from "react";

/** Props for {@link App}. */
export interface AppProps {
  /** Which theme's design tokens to apply. */
  theme: "light" | "dark";
}

/**
 * The M0 placeholder window: just the app name, styled with design tokens.
 * The real three-pane shell arrives in M2 (plan.md §15).
 * @param props - See {@link AppProps}.
 * @returns The root element.
 */
export function App({ theme }: AppProps): ReactElement {
  const tokens = cssVariables(theme) as CSSProperties;
  return (
    <main
      style={{
        ...tokens,
        minHeight: "100vh",
        display: "grid",
        placeItems: "center",
        background: "var(--bg)",
        color: "var(--text)",
        fontFamily: "var(--font)",
        colorScheme: theme,
      }}
    >
      <h1>{strings["app.name"]}</h1>
    </main>
  );
}

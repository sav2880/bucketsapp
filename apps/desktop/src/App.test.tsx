// SPDX-License-Identifier: Apache-2.0

import { renderToString } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { App } from "./App";

describe("App", () => {
  it("shows the app name", () => {
    expect(renderToString(<App theme="light" />)).toContain("<h1>Buckets</h1>");
  });

  it("applies the theme's design tokens", () => {
    expect(renderToString(<App theme="dark" />)).toContain("--bg:#1c1c1e");
    expect(renderToString(<App theme="light" />)).toContain("--bg:#ffffff");
  });
});

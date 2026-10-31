// SPDX-License-Identifier: Apache-2.0

import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { App } from "./App";

describe("App", () => {
  it("shows the app name", () => {
    render(<App theme="light" />);
    expect(screen.getByRole("heading", { name: "Buckets" })).toBeTruthy();
  });

  it("applies the theme's design tokens", () => {
    const { container: light } = render(<App theme="light" />);
    expect(light.querySelector("main")?.style.getPropertyValue("--bg")).toBe("#ffffff");
    const { container: dark } = render(<App theme="dark" />);
    expect(dark.querySelector("main")?.style.getPropertyValue("--bg")).toBe("#1c1c1e");
  });
});

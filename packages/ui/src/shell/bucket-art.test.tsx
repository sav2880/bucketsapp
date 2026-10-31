// SPDX-License-Identifier: Apache-2.0

import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { MotionSettingProvider } from "../hooks/use-motion-preference";
import { BucketArt } from "./bucket-art";

const props = {
  inCount: 2,
  restingCount: 1,
  lidOn: false,
  mood: "idle" as const,
  label: "Games, 2 items ready to draw",
};

describe("BucketArt", () => {
  it("has an accessible name", () => {
    render(<BucketArt {...props} />);
    expect(screen.getByRole("img", { name: "Games, 2 items ready to draw" })).toBeTruthy();
  });

  it("draws a slip for every item and a grey one for each that is resting", () => {
    const { container } = render(<BucketArt {...props} />);
    expect(container.querySelectorAll(".bk-slip")).toHaveLength(3);
    expect(container.querySelectorAll(".bk-resting")).toHaveLength(1);
    expect(container.querySelectorAll(".bk-slip-band")).toHaveLength(2);
  });

  it("shows the lid only when asked", () => {
    const { rerender } = render(<BucketArt {...props} />);
    expect(screen.getByTestId("bucket-lid").classList.contains("on")).toBe(false);
    rerender(<BucketArt {...props} lidOn />);
    expect(screen.getByTestId("bucket-lid").classList.contains("on")).toBe(true);
    expect(screen.getByTestId("bucket-art").classList.contains("bk-lid-on")).toBe(true);
  });

  it("shows one face at a time", () => {
    const { container, rerender } = render(<BucketArt {...props} />);
    expect(container.querySelector("[data-mood]")?.getAttribute("data-mood")).toBe("idle");
    rerender(<BucketArt {...props} mood="sleep" />);
    expect(container.querySelector("[data-mood]")?.getAttribute("data-mood")).toBe("sleep");
    expect(container.querySelectorAll(".bk-face-line")).toHaveLength(3);
  });

  it("renders every expression", () => {
    const moods = ["idle", "wow", "happy", "wait", "sleep", "no"] as const;
    for (const mood of moods) {
      const { container, unmount } = render(<BucketArt {...props} mood={mood} />);
      expect(container.querySelectorAll(".bk-face-part, .bk-face-line").length).toBeGreaterThan(0);
      unmount();
    }
  });

  it("gives the lid a fade instead of a slide when motion is reduced", () => {
    render(
      <MotionSettingProvider setting="reduce">
        <BucketArt {...props} />
      </MotionSettingProvider>,
    );
    expect(screen.getByTestId("bucket-art").hasAttribute("data-reduced")).toBe(true);
  });

  it("keeps the slide when motion is allowed", () => {
    render(
      <MotionSettingProvider setting="allow">
        <BucketArt {...props} />
      </MotionSettingProvider>,
    );
    expect(screen.getByTestId("bucket-art").hasAttribute("data-reduced")).toBe(false);
  });

  it("gives each drawing its own gradient so two can sit side by side", () => {
    const { container } = render(
      <>
        <BucketArt {...props} />
        <BucketArt {...props} />
      </>,
    );
    const ids = [...container.querySelectorAll("linearGradient")].map((g) => g.id);
    expect(new Set(ids).size).toBe(2);
  });
});

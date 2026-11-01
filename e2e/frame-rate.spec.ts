// SPDX-License-Identifier: Apache-2.0

import { test, type Page } from "@playwright/test";
import { createBucket, pasteItems, typeItems } from "./helpers";

// A measurement, not a pass/fail test: frame times depend on the machine. It is skipped unless
// asked for with `pnpm measure:frames` (plan.md §15, M3: "animations hold 60 fps on modest
// hardware"). It plays a draw and a finish while the browser's CPU is slowed down, and reports
// how long frames took and which properties were animated.

const RATES = [1, 4, 6] as const;

test.skip(process.env["MEASURE_FRAMES"] === undefined, "run with pnpm measure:frames");

/** What one measured run found. */
interface Report {
  frames: number;
  medianMs: number;
  p95Ms: number;
  worstMs: number;
  over20: number;
  properties: string[];
  peakAnimations: number;
}

/**
 * Plays a draw and a finish, recording the gap between animation frames.
 *
 * @param page - The page, with a bucket that has items and an empty hand.
 * @returns What happened.
 */
async function measure(page: Page): Promise<Report> {
  await page.evaluate(() => {
    const state = { gaps: [] as number[], props: new Set<string>(), peak: 0, running: true };
    Object.assign(window, { __measure: state });
    let last = performance.now();
    const tick = (now: number): void => {
      state.gaps.push(now - last);
      last = now;
      const animations = document.getAnimations();
      state.peak = Math.max(state.peak, animations.length);
      for (const animation of animations) {
        const effect = animation.effect as KeyframeEffect | null;
        for (const frame of effect?.getKeyframes() ?? [])
          for (const key of Object.keys(frame))
            if (!["offset", "easing", "composite", "computedOffset"].includes(key))
              state.props.add(key);
      }
      if (state.running) requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  });
  await page.getByTestId("draw").click();
  await page.waitForTimeout(1800);
  await page.getByTestId("done").click();
  await page.waitForTimeout(1500);
  return page.evaluate(() => {
    const state = (
      window as unknown as {
        __measure: { gaps: number[]; props: Set<string>; peak: number; running: boolean };
      }
    ).__measure;
    state.running = false;
    const gaps = state.gaps.slice(1).sort((a, b) => a - b);
    const at = (q: number): number =>
      gaps[Math.min(gaps.length - 1, Math.floor(gaps.length * q))] ?? 0;
    return {
      frames: gaps.length,
      medianMs: Math.round(at(0.5) * 10) / 10,
      p95Ms: Math.round(at(0.95) * 10) / 10,
      worstMs: Math.round((gaps.at(-1) ?? 0) * 10) / 10,
      over20: gaps.filter((g) => g > 20).length,
      properties: [...state.props].sort(),
      peakAnimations: state.peak,
    };
  });
}

for (const items of [5, 500]) {
  test(`frame times with ${String(items)} items`, async ({ page, browserName }) => {
    test.skip(browserName !== "chromium", "CPU throttling needs Chromium's DevTools protocol");
    test.setTimeout(120_000);
    await page.goto("/");
    await createBucket(page, "Measured");
    if (items === 5) await typeItems(page, "One", "Two", "Three", "Four", "Five");
    else
      await pasteItems(
        page,
        Array.from({ length: items }, (_, i) => `Item ${String(i + 1)}`),
      );
    await page.getByText(/items? inside/).waitFor({ timeout: 30_000 });
    const client = await page.context().newCDPSession(page);
    const rows: Record<string, Report>[] = [];
    for (const rate of RATES) {
      await client.send("Emulation.setCPUThrottlingRate", { rate });
      const report = await measure(page);
      rows.push({ [`${String(rate)}x slower CPU`]: report });
      if (rate === RATES.at(-1)) continue;
      // Put an item back so the next run has something to draw.
      await page.getByTestId("draw").click();
      await page.waitForTimeout(1800);
      await page.getByTestId("toss-back").click();
      const confirm = page.getByRole("dialog");
      if (await confirm.isVisible())
        await confirm.getByRole("button", { name: /Toss back/ }).click();
      await page.waitForTimeout(1500);
    }
    await client.send("Emulation.setCPUThrottlingRate", { rate: 1 });
    console.log(`\n${String(items)} items\n${JSON.stringify(rows, null, 2)}`);
  });
}

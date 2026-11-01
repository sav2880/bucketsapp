// SPDX-License-Identifier: Apache-2.0

import { createSeededRng } from "@buckets/core";
import { createBlobStore, createMemoryStorage } from "@buckets/storage";
import { act, renderHook } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { EnvironmentProvider, type AppEnvironment } from "../app-environment";
import { MotionSettingProvider, type MotionSetting } from "../hooks/use-motion-preference";
import { recorder } from "../../test/recording-animator";
import type { Animator } from "./animator";
import { SAFETY_TIMEOUT_MS, useChoreography } from "./use-choreography";

/** Two stand-ins for the real animators; each just notes that its bucket-rocking was used. */
const used = vi.hoisted(() => [] as string[]);

vi.mock("./motion-animator", async () => {
  const { instantAnimator } = await import("./animator");
  return {
    createMotionAnimator: () => ({
      ...instantAnimator,
      wobble: () => {
        used.push("motion");
        return Promise.resolve();
      },
    }),
    createFadeAnimator: () => ({
      ...instantAnimator,
      wobble: () => {
        used.push("fade");
        return Promise.resolve();
      },
    }),
  };
});

function setup(
  animator: Animator | undefined,
  conceal = false,
  motion: MotionSetting = "allow",
): ReturnType<typeof renderHook<ReturnType<typeof useChoreography>, unknown>> & {
  svg: SVGSVGElement;
  card: HTMLElement;
} {
  const storage = createMemoryStorage();
  const environment: AppEnvironment = {
    memberId: "me",
    deviceId: "d",
    displayName: "Me",
    timeZone: "UTC",
    now: () => new Date(0),
    rng: createSeededRng(1),
    makeId: () => "x",
    blobs: createBlobStore(storage),
    animator,
  };
  const wrapper = ({ children }: { children: ReactNode }) => (
    <MotionSettingProvider setting={motion}>
      <EnvironmentProvider environment={environment}>{children}</EnvironmentProvider>
    </MotionSettingProvider>
  );
  const result = renderHook(() => useChoreography(conceal), { wrapper });
  const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  svg.getBoundingClientRect = () => ({ left: 100, top: 0, width: 260, height: 250 }) as DOMRect;
  const body = document.createElementNS("http://www.w3.org/2000/svg", "g");
  svg.append(body);
  result.result.current.bodyRef.current = body;
  const card = document.createElement("li");
  result.result.current.registerCard("a", card);
  return { ...result, svg, card };
}

beforeEach(() => {
  vi.useFakeTimers();
});
afterEach(() => {
  vi.useRealTimers();
});

describe("a draw", () => {
  it("rocks the bucket, flies a slip to the card, then lets the card settle", async () => {
    const r = recorder();
    const { result } = setup(r.animator);
    await act(async () => {
      await result.current.drew(["a"]);
    });
    expect(r.log.filter((l) => !l.startsWith("cancel"))).toEqual(["wobble", "flySlip", "settle"]);
  });

  it("hides the card while its slip is on the way, then shows it", async () => {
    const r = recorder({ hold: true });
    const { result } = setup(r.animator);
    let done = Promise.resolve();
    act(() => {
      done = result.current.drew(["a"]);
    });
    expect(result.current.pending.has("a")).toBe(true);
    expect(result.current.busy).toBe(true);
    await act(async () => {
      r.release(); // wobble
      await vi.advanceTimersByTimeAsync(0);
      r.release(); // flySlip
      await vi.advanceTimersByTimeAsync(0);
    });
    expect(result.current.pending.has("a")).toBe(false);
    await act(async () => {
      r.release(); // settle
      await done;
    });
    expect(result.current.busy).toBe(false);
  });

  it("looks surprised for a moment, then goes back to normal", async () => {
    const r = recorder();
    const { result } = setup(r.animator);
    await act(async () => {
      await result.current.drew(["a"]);
    });
    expect(result.current.mood).toBe("wow");
    act(() => {
      vi.advanceTimersByTime(1000);
    });
    expect(result.current.mood).toBeUndefined();
  });

  it("keeps a Mystery Bag title hidden until the card is edge-on", async () => {
    const r = recorder();
    let concealedAtMidpoint: boolean | undefined;
    let latest: () => ReadonlySet<string> = () => new Set();
    const animator: Animator = {
      ...r.animator,
      flip: (card, atMidpoint) =>
        r.animator.flip(card, () => {
          concealedAtMidpoint = latest().has("a");
          atMidpoint();
        }),
    };
    const { result } = setup(animator, true);
    latest = () => result.current.concealed;
    await act(async () => {
      await result.current.drew(["a"]);
    });
    expect(concealedAtMidpoint).toBe(true);
    expect(result.current.concealed.size).toBe(0);
    expect(r.log).toContain("flip");
    expect(r.log).not.toContain("settle");
  });

  it("plays one slip after another when several items are drawn", async () => {
    const r = recorder();
    const { result } = setup(r.animator);
    result.current.registerCard("b", document.createElement("li"));
    await act(async () => {
      await result.current.drew(["a", "b"]);
    });
    expect(r.log.filter((l) => l === "flySlip")).toHaveLength(2);
    expect(r.log.filter((l) => l === "settle")).toHaveLength(2);
  });

  it("copes with a card that isn't on screen", async () => {
    const r = recorder();
    const { result } = setup(r.animator);
    await act(async () => {
      await result.current.drew(["missing"]);
    });
    expect(r.log).not.toContain("flySlip");
    expect(result.current.busy).toBe(false);
  });

  it("ignores a second draw while the first is playing", async () => {
    const r = recorder({ hold: true });
    const { result } = setup(r.animator);
    act(() => {
      void result.current.drew(["a"]);
    });
    await act(async () => {
      await result.current.drew(["a"]);
    });
    expect(r.log.filter((l) => l === "wobble")).toHaveLength(1);
  });

  it("lets go even if the animation breaks", async () => {
    const r = recorder({ fail: "flySlip" });
    const { result } = setup(r.animator);
    await act(async () => {
      await result.current.drew(["a"]);
    });
    expect(result.current.busy).toBe(false);
    expect(result.current.pending.size).toBe(0);
    expect(r.log.at(-1)).toBe("cancelAll");
  });

  it("lets go after the safety timeout if an animation never ends", async () => {
    const r = recorder({ hold: true });
    const { result } = setup(r.animator);
    act(() => {
      void result.current.drew(["a"]);
    });
    expect(result.current.busy).toBe(true);
    await act(async () => {
      await vi.advanceTimersByTimeAsync(SAFETY_TIMEOUT_MS);
    });
    expect(result.current.busy).toBe(false);
    expect(result.current.pending.size).toBe(0);
  });
});

describe("a refused draw", () => {
  it("shakes the bucket and looks unhappy, without locking anything", () => {
    const r = recorder();
    const { result } = setup(r.animator);
    act(() => {
      result.current.refused();
    });
    expect(r.log).toEqual(["shake"]);
    expect(result.current.mood).toBe("no");
    expect(result.current.busy).toBe(false);
    act(() => {
      vi.advanceTimersByTime(900);
    });
    expect(result.current.mood).toBeUndefined();
  });

  it("only changes the face when the bucket isn't on screen", () => {
    const r = recorder();
    const { result } = setup(r.animator);
    result.current.bodyRef.current = null;
    act(() => {
      result.current.refused();
    });
    expect(r.log).toEqual([]);
    expect(result.current.mood).toBe("no");
  });
});

describe("finishing and tossing back", () => {
  it("takes a copy of the card, if it is on screen", () => {
    const r = recorder();
    const { result } = setup(r.animator);
    expect(result.current.snapshot("a")).toBeDefined();
    expect(result.current.snapshot("nope")).toBeUndefined();
    expect(r.log).toEqual(["ghost"]);
  });

  it("sends a tossed-back card to the bucket mouth, then plops", async () => {
    const r = recorder();
    const { result } = setup(r.animator);
    const shot = result.current.snapshot("a");
    await act(async () => {
      await result.current.resolved(shot, "tossed-back", true);
    });
    // The mouth is 28% of the way down the 260×250 drawing, in the middle.
    expect(r.ghost.flown).toEqual([{ x: 230, y: 70 }]);
    expect(r.log).toContain("plop");
    expect(result.current.mood).toBeUndefined();
  });

  it("sends a finished card to the done pile and pulses it", async () => {
    const r = recorder();
    const { result } = setup(r.animator);
    const pile = document.createElement("button");
    pile.getBoundingClientRect = () => ({ left: 10, top: 20, width: 40, height: 20 }) as DOMRect;
    result.current.pileRef.current = pile;
    const shot = result.current.snapshot("a");
    await act(async () => {
      await result.current.resolved(shot, "done", true);
    });
    expect(r.ghost.flown).toEqual([{ x: 30, y: 30 }]);
    expect(r.log).toContain("pulse");
    expect(r.log).not.toContain("plop");
    expect(result.current.mood).toBe("happy");
  });

  it("sends a finished card back to the bucket when finishing returns items", async () => {
    const r = recorder();
    const { result } = setup(r.animator);
    const shot = result.current.snapshot("a");
    await act(async () => {
      await result.current.resolved(shot, "done", false);
    });
    expect(r.ghost.flown).toEqual([{ x: 230, y: 70 }]);
    expect(r.log).toContain("plop");
  });

  it("just plops when there is no pile on screen", async () => {
    const r = recorder();
    const { result } = setup(r.animator);
    const shot = result.current.snapshot("a");
    await act(async () => {
      await result.current.resolved(shot, "done", true);
    });
    expect(r.ghost.flown).toEqual([]);
    expect(r.ghost.discarded).toBe(1);
    expect(r.log).toContain("plop");
  });

  it("works with no copy at all", async () => {
    const r = recorder();
    const { result } = setup(r.animator);
    await act(async () => {
      await result.current.resolved(undefined, "tossed-back", true);
    });
    expect(r.log).toContain("plop");
    expect(result.current.busy).toBe(false);
  });
});

describe("choosing the animator", () => {
  beforeEach(() => {
    used.length = 0;
  });

  it("uses the full animations normally", async () => {
    const { result } = setup(undefined, false, "allow");
    await act(async () => {
      await result.current.drew(["a"]);
    });
    expect(used).toEqual(["motion"]);
  });

  it("uses the fades when motion is reduced", async () => {
    const { result } = setup(undefined, false, "reduce");
    await act(async () => {
      await result.current.drew(["a"]);
    });
    expect(used).toEqual(["fade"]);
  });

  it("prefers the one the app supplies", async () => {
    const r = recorder();
    const { result } = setup(r.animator, false, "reduce");
    await act(async () => {
      await result.current.drew(["a"]);
    });
    expect(used).toEqual([]);
    expect(r.log).toContain("wobble");
  });

  it("finishes everything when the pane goes away", () => {
    const r = recorder();
    const { unmount } = setup(r.animator);
    unmount();
    expect(r.log).toContain("cancelAll");
  });
});

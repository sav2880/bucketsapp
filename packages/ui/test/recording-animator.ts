// SPDX-License-Identifier: Apache-2.0

import type { Animator, Ghost } from "../src/shell/animator";

/** An animator that logs every call and, when `hold` is set, waits for the test to let go. */
export function recorder(options: { hold?: boolean; fail?: string } = {}): {
  animator: Animator;
  log: string[];
  release: () => void;
  ghost: Ghost & { flown: { x: number; y: number }[]; discarded: number };
} {
  const log: string[] = [];
  const waiting: (() => void)[] = [];
  const step = (name: string): Promise<void> => {
    log.push(name);
    if (options.fail === name) return Promise.reject(new Error(name));
    return options.hold ? new Promise<void>((resolve) => waiting.push(resolve)) : Promise.resolve();
  };
  const ghost = {
    flown: [] as { x: number; y: number }[],
    discarded: 0,
    flyTo(target: { x: number; y: number }) {
      ghost.flown.push(target);
      return step("ghost.flyTo");
    },
    discard() {
      ghost.discarded += 1;
    },
  };
  const animator: Animator = {
    wobble: () => step("wobble"),
    plop: () => step("plop"),
    shake: () => step("shake"),
    flySlip: () => step("flySlip"),
    settle: () => step("settle"),
    flip: (_card, atMidpoint) => {
      const done = step("flip");
      atMidpoint();
      log.push("flip.midpoint");
      return done;
    },
    pulse: () => step("pulse"),
    ghost: () => {
      log.push("ghost");
      return ghost;
    },
    cancelAll: () => {
      log.push("cancelAll");
    },
  };
  return {
    animator,
    log,
    release: () => {
      for (const resolve of waiting.splice(0)) resolve();
    },
    ghost,
  };
}

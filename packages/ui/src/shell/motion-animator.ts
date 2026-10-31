// SPDX-License-Identifier: Apache-2.0

import { animate } from "motion";
import { motion } from "../tokens/index";
import { centreOf, parseBezier, type Animator, type Ghost, type Point } from "./animator";

/** A slip in flight is this big before it is stretched to the card's size (matches `.bk-flying-slip`). */
const SLIP_WIDTH = 34;
const SLIP_HEIGHT = 50;

/** Colour variables set on the bucket's pane that floating copies would otherwise lose. */
const INHERITED = ["--enamel", "--enamel-text", "--on-enamel"] as const;

const seconds = (ms: number): number => ms / 1000;
const flyEase = parseBezier(motion.easeFly);
const returnEase = parseBezier(motion.easeReturn);
const outEase = parseBezier(motion.easeOut);

/** The animation controls Motion returns; they can be awaited and finished early. */
type Controls = ReturnType<typeof animate>;

/**
 * Keeps track of what is running so everything can be finished early, and removes floating
 * elements when they are done or abandoned.
 */
function createRunner(): {
  play: (controls: Controls) => Promise<void>;
  float: (element: HTMLElement) => () => void;
  cancelAll: () => void;
} {
  const running = new Set<Controls>();
  const floating = new Set<HTMLElement>();
  return {
    async play(controls) {
      running.add(controls);
      try {
        await controls;
      } finally {
        running.delete(controls);
      }
    },
    float(element) {
      floating.add(element);
      document.body.append(element);
      return () => {
        floating.delete(element);
        element.remove();
      };
    },
    cancelAll() {
      for (const controls of running) controls.complete();
      running.clear();
      for (const element of floating) element.remove();
      floating.clear();
    },
  };
}

/** Copies the bucket's colour variables onto a floating element. */
function copyColours(from: Element, to: HTMLElement): void {
  const computed = getComputedStyle(from);
  for (const name of INHERITED) to.style.setProperty(name, computed.getPropertyValue(name));
}

/**
 * Leaves a picture of a card floating exactly where the card is. It must not be found,
 * focused or read, so ids, test ids and focus are stripped and it is hidden from assistive tech.
 */
function floatCopy(
  card: Element,
  runner: ReturnType<typeof createRunner>,
): { copy: HTMLElement; from: Point; remove: () => void } {
  const rect = card.getBoundingClientRect();
  const copy = card.cloneNode(true) as HTMLElement;
  for (const inner of [copy, ...copy.querySelectorAll("[id], [data-testid]")]) {
    inner.removeAttribute("id");
    inner.removeAttribute("data-testid");
  }
  for (const inner of copy.querySelectorAll("button, input, a, select, textarea, [tabindex]"))
    inner.setAttribute("tabindex", "-1");
  copy.setAttribute("aria-hidden", "true");
  copy.className = "bk-ghost";
  copy.style.left = `${String(rect.left)}px`;
  copy.style.top = `${String(rect.top)}px`;
  copy.style.width = `${String(rect.width)}px`;
  copy.style.height = `${String(rect.height)}px`;
  copyColours(card, copy);
  return { copy, from: centreOf(rect), remove: runner.float(copy) };
}

/**
 * The full animations, ported from the prototype with Motion. Only transform and opacity are
 * animated, so the browser can run them off the main thread (plan.md §12.3, M3 exit criteria).
 *
 * @returns An animator.
 */
export function createMotionAnimator(): Animator {
  const runner = createRunner();
  const { play } = runner;
  return {
    wobble: (body) =>
      play(
        animate(
          body,
          { rotate: [0, -5, 4, -2, 0] },
          { duration: seconds(motion.ms.wobble), ease: "easeInOut" },
        ),
      ),
    plop: (body) =>
      play(
        animate(
          body,
          { scaleX: [1, 1.04, 0.98, 1], scaleY: [1, 0.94, 1.03, 1] },
          { duration: seconds(motion.ms.plop), ease: outEase },
        ),
      ),
    shake: (body) =>
      play(
        animate(
          body,
          { x: [0, -6, 6, -4, 0] },
          { duration: seconds(motion.ms.shake), ease: "easeInOut" },
        ),
      ),
    async flySlip(from, card) {
      const slip = document.createElement("div");
      slip.className = "bk-flying-slip";
      slip.setAttribute("aria-hidden", "true");
      slip.style.left = `${String(from.x - SLIP_WIDTH / 2)}px`;
      slip.style.top = `${String(from.y - SLIP_HEIGHT / 2)}px`;
      copyColours(card, slip);
      const remove = runner.float(slip);
      const rect = card.getBoundingClientRect();
      const to = centreOf(rect);
      try {
        await play(
          animate(
            slip,
            {
              x: [0, 0, to.x - from.x],
              y: [26, -64, to.y - from.y],
              rotate: [-8, 6, 0],
              scaleX: [0.8, 1, rect.width / SLIP_WIDTH],
              scaleY: [0.8, 1, rect.height / SLIP_HEIGHT],
              opacity: [0, 1, 1],
            },
            { duration: seconds(motion.ms.draw), ease: flyEase, times: [0, 0.42, 1] },
          ),
        );
      } finally {
        remove();
      }
    },
    settle: (card) =>
      play(
        animate(card, { scale: [0.97, 1] }, { duration: seconds(motion.ms.settle), ease: outEase }),
      ),
    async flip(card, atMidpoint) {
      await play(
        animate(
          card,
          { rotateY: [0, 90] },
          { duration: seconds(motion.ms.flipOut), ease: "easeIn" },
        ),
      );
      atMidpoint();
      await play(
        animate(
          card,
          { rotateY: [-90, 0] },
          { duration: seconds(motion.ms.flipIn), ease: outEase },
        ),
      );
    },
    pulse: (target) =>
      play(
        animate(
          target,
          { scale: [1, 1.1, 1] },
          { duration: seconds(motion.ms.pilePulse), ease: outEase },
        ),
      ),
    ghost(card) {
      const { copy, from, remove } = floatCopy(card, runner);
      const ghost: Ghost = {
        async flyTo(target: Point) {
          const dx = target.x - from.x;
          const dy = target.y - from.y;
          try {
            await play(
              animate(
                copy,
                {
                  x: [0, dx * 0.5, dx],
                  y: [0, dy * 0.5 - 50, dy],
                  scale: [1, 0.5, 0.1],
                  rotate: [0, -6, 8],
                  opacity: [1, 1, 0.2],
                },
                { duration: seconds(motion.ms.return), ease: returnEase, times: [0, 0.5, 1] },
              ),
            );
          } finally {
            remove();
          }
        },
        discard: remove,
      };
      return ghost;
    },
    cancelAll: runner.cancelAll,
  };
}

/**
 * The animations for people who asked for less motion (plan.md §12.3): nothing flies, rocks or
 * flips; things that appear just fade in, and copies fade out.
 *
 * @returns An animator.
 */
export function createFadeAnimator(): Animator {
  const runner = createRunner();
  const { play } = runner;
  const fadeIn = (element: Element): Promise<void> =>
    play(animate(element, { opacity: [0, 1] }, { duration: seconds(motion.ms.fade) }));
  const none = (): Promise<void> => Promise.resolve();
  return {
    wobble: none,
    plop: none,
    shake: none,
    flySlip: (_from, card) => fadeIn(card),
    settle: none,
    flip: (card, atMidpoint) => {
      atMidpoint();
      return fadeIn(card);
    },
    pulse: none,
    ghost(card) {
      const { copy, remove } = floatCopy(card, runner);
      return {
        async flyTo() {
          try {
            await play(animate(copy, { opacity: [1, 0] }, { duration: seconds(motion.ms.fade) }));
          } finally {
            remove();
          }
        },
        discard: remove,
      };
    },
    cancelAll: runner.cancelAll,
  };
}

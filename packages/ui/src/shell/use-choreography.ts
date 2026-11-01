// SPDX-License-Identifier: Apache-2.0

import { useCallback, useEffect, useMemo, useRef, useState, type RefObject } from "react";
import { flushSync } from "react-dom";
import { useEnvironment } from "../app-environment";
import { useMotionPreference } from "../hooks/use-motion-preference";
import { motion } from "../tokens/index";
import { centreOf, type Animator, type Ghost, type Point } from "./animator";
import type { Mood } from "./bucket-art-model";
import { createFadeAnimator, createMotionAnimator } from "./motion-animator";

/**
 * A job that outlives its animation can't leave the screen locked: after this long the lock
 * is released whatever the animator is doing. The longest sequence (a draw of several items)
 * is well under this.
 */
export const SAFETY_TIMEOUT_MS = 6000;

/** Where in the bucket pane the mouth is, as a fraction of the drawing's height (70 of 250). */
const MOUTH_FRACTION = 70 / 250;

/** A card about to leave the hand: a floating copy taken just before the data changes. */
export interface HandSnapshot {
  /** The copy. */
  ghost: Ghost;
}

/** What {@link useChoreography} gives the bucket pane. */
export interface Choreography {
  /** True while an animation sequence runs; draw, done and toss back are ignored meanwhile. */
  busy: boolean;
  /** Items just drawn whose cards aren't shown yet. */
  pending: ReadonlySet<string>;
  /** Items just drawn whose titles stay hidden until the card flips (Mystery Bag). */
  concealed: ReadonlySet<string>;
  /** A passing expression, or `undefined` to use the resting one. */
  mood: Mood | undefined;
  /** Set on the bucket's SVG group. */
  bodyRef: RefObject<SVGGElement | null>;
  /** Set on the done pile, when there is one. */
  pileRef: RefObject<HTMLButtonElement | null>;
  /**
   * Tells the hook where a card is, for flying slips to it. Called from a card's `ref`.
   *
   * @param itemId - The item.
   * @param element - The card, or `null` when it goes away.
   */
  registerCard: (itemId: string, element: HTMLElement | null) => void;
  /** A draw was refused: shake the bucket and look unhappy. */
  refused: () => void;
  /**
   * Plays the draw after the data has changed.
   *
   * @param itemIds - The items drawn.
   * @returns Resolves when the sequence ends.
   */
  drew: (itemIds: readonly string[]) => Promise<void>;
  /**
   * Takes a floating copy of a card. Call it before running the command that removes the card.
   *
   * @param itemId - The item.
   * @returns The copy, or `undefined` when the card isn't on screen.
   */
  snapshot: (itemId: string) => HandSnapshot | undefined;
  /**
   * Plays the return or the finish after the data has changed.
   *
   * @param snapshot - From {@link Choreography.snapshot}.
   * @param kind - Finished or tossed back.
   * @param toPile - Whether a finished slip goes to the done pile (remove-style buckets).
   * @returns Resolves when the sequence ends.
   */
  resolved: (
    snapshot: HandSnapshot | undefined,
    kind: "done" | "tossed-back",
    toPile: boolean,
  ) => Promise<void>;
}

/** Chooses the animator: the environment's (tests), the fades when reduced, otherwise the full set. */
function useAnimator(): Animator {
  const environment = useEnvironment();
  const reduced = useMotionPreference();
  const provided = environment.animator;
  return useMemo(
    () => provided ?? (reduced ? createFadeAnimator() : createMotionAnimator()),
    [provided, reduced],
  );
}

/** The point where slips enter and leave: the middle of the bucket's mouth. */
function mouthOf(body: SVGGElement | null): Point | undefined {
  const svg = body?.ownerSVGElement;
  if (!svg) return undefined;
  const rect = svg.getBoundingClientRect();
  return { x: rect.left + rect.width / 2, y: rect.top + rect.height * MOUTH_FRACTION };
}

const without = (set: ReadonlySet<string>, id: string): Set<string> => {
  const next = new Set(set);
  next.delete(id);
  return next;
};

/**
 * Plays the bucket's animations around draws, returns and finishes (plan.md §12.3).
 *
 * The data changes first and the animation covers the already-changed view, as the prototype
 * did. While a sequence runs, `busy` is true so the caller can ignore a second draw. Any
 * animation failure is swallowed: it is decoration, the data is already right, and the screen
 * must never stay locked (see {@link SAFETY_TIMEOUT_MS}).
 *
 * @param concealTitles - Whether newly drawn cards keep their title hidden until they flip.
 * @returns State to render and functions to call.
 */
export function useChoreography(concealTitles: boolean): Choreography {
  const animator = useAnimator();
  const bodyRef = useRef<SVGGElement | null>(null);
  const pileRef = useRef<HTMLButtonElement | null>(null);
  const cards = useRef(new Map<string, HTMLElement>());
  const busyRef = useRef(false);
  const [busy, setBusy] = useState(false);
  const [pending, setPending] = useState<ReadonlySet<string>>(new Set());
  const [concealed, setConcealed] = useState<ReadonlySet<string>>(new Set());
  const [mood, setMoodState] = useState<Mood | undefined>(undefined);
  const moodTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  useEffect(
    () => () => {
      clearTimeout(moodTimer.current);
      animator.cancelAll();
    },
    [animator],
  );

  const setMood = useCallback((next: Mood, ms: number): void => {
    clearTimeout(moodTimer.current);
    setMoodState(next);
    moodTimer.current = setTimeout(() => {
      setMoodState(undefined);
    }, ms);
  }, []);

  const registerCard = useCallback((itemId: string, element: HTMLElement | null): void => {
    if (element) cards.current.set(itemId, element);
    else cards.current.delete(itemId);
  }, []);

  /** Runs a sequence with the lock held, and always lets go. */
  const run = useCallback(
    async (sequence: () => Promise<void>): Promise<void> => {
      if (busyRef.current) return;
      busyRef.current = true;
      setBusy(true);
      let timer: ReturnType<typeof setTimeout> | undefined;
      try {
        await Promise.race([
          sequence(),
          new Promise<void>((resolve) => {
            timer = setTimeout(resolve, SAFETY_TIMEOUT_MS);
          }),
        ]);
      } catch {
        // Decoration only; the data is already right.
      } finally {
        clearTimeout(timer);
        animator.cancelAll();
        busyRef.current = false;
        setBusy(false);
        setPending(new Set());
        setConcealed(new Set());
      }
    },
    [animator],
  );

  const refused = useCallback((): void => {
    setMood("no", motion.ms.moodNo);
    if (bodyRef.current) void animator.shake(bodyRef.current).catch(() => undefined);
  }, [animator, setMood]);

  const drew = useCallback(
    (itemIds: readonly string[]): Promise<void> =>
      run(async () => {
        // Cards are rendered but hidden first, so the slip has somewhere to land.
        flushSync(() => {
          setPending(new Set(itemIds));
          setConcealed(new Set(concealTitles ? itemIds : []));
        });
        setMood("wow", motion.ms.moodWow);
        const body = bodyRef.current;
        if (body) await animator.wobble(body);
        for (const id of itemIds) {
          const card = cards.current.get(id);
          const mouth = mouthOf(body);
          if (card && mouth) await animator.flySlip(mouth, card);
          flushSync(() => {
            setPending((current) => without(current, id));
          });
          if (!card) continue;
          if (concealTitles)
            await animator.flip(card, () => {
              flushSync(() => {
                setConcealed((current) => without(current, id));
              });
            });
          else await animator.settle(card);
        }
      }),
    [animator, concealTitles, run, setMood],
  );

  const snapshot = useCallback(
    (itemId: string): HandSnapshot | undefined => {
      const card = cards.current.get(itemId);
      return card ? { ghost: animator.ghost(card) } : undefined;
    },
    [animator],
  );

  const resolved = useCallback(
    (
      shot: HandSnapshot | undefined,
      kind: "done" | "tossed-back",
      toPile: boolean,
    ): Promise<void> =>
      run(async () => {
        if (kind === "done") setMood("happy", motion.ms.moodHappy);
        const body = bodyRef.current;
        const pile = pileRef.current;
        // A finished slip goes to the pile on remove-style buckets. With no pile on screen it
        // simply disappears and the bucket plops; otherwise it goes back into the bucket.
        const goesToPile = kind === "done" && toPile;
        const target = goesToPile ? pile && centreOf(pile.getBoundingClientRect()) : mouthOf(body);
        if (shot && target) await shot.ghost.flyTo(target);
        else shot?.ghost.discard();
        if (goesToPile && pile) await animator.pulse(pile);
        else if (body) await animator.plop(body);
      }),
    [animator, run, setMood],
  );

  return {
    busy,
    pending,
    concealed,
    mood,
    bodyRef,
    pileRef,
    registerCard,
    refused,
    drew,
    snapshot,
    resolved,
  };
}

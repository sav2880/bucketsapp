// SPDX-License-Identifier: Apache-2.0

/** A point in the window, in CSS pixels. */
export interface Point {
  /** Distance from the left edge. */
  x: number;
  /** Distance from the top edge. */
  y: number;
}

/** A copy of a card left floating where the card was, so it can fly after the card is gone. */
export interface Ghost {
  /**
   * Flies the copy to a point and then removes it.
   *
   * @param target - Where it should end up (the middle of the bucket mouth or the done pile).
   * @returns Resolves when it has arrived.
   */
  flyTo(target: Point): Promise<void>;
  /** Removes the copy without flying it. */
  discard(): void;
}

/**
 * Everything the bucket does on screen, behind one interface so the sequencing in
 * `use-choreography.ts` can be tested without a browser. All of it is decoration: nothing here
 * changes data, and every method must resolve even when it has nothing to do.
 */
export interface Animator {
  /**
   * Rocks the bucket before a draw.
   *
   * @param body - The bucket's SVG group.
   * @returns Resolves when it stops.
   */
  wobble(body: Element): Promise<void>;
  /**
   * Squashes the bucket as something lands in it.
   *
   * @param body - The bucket's SVG group.
   * @returns Resolves when it stops.
   */
  plop(body: Element): Promise<void>;
  /**
   * Shakes the bucket from side to side: "not now".
   *
   * @param body - The bucket's SVG group.
   * @returns Resolves when it stops.
   */
  shake(body: Element): Promise<void>;
  /**
   * Sends a paper slip from the bucket mouth to a card that is waiting, hidden, to appear.
   *
   * @param from - The bucket mouth.
   * @param card - The card the slip becomes.
   * @returns Resolves when the slip has arrived (the caller then shows the card).
   */
  flySlip(from: Point, card: Element): Promise<void>;
  /**
   * Lets a card settle into place once it is shown.
   *
   * @param card - The card.
   * @returns Resolves when it has settled.
   */
  settle(card: Element): Promise<void>;
  /**
   * Turns a card over to reveal a hidden title (Mystery Bag).
   *
   * @param card - The card.
   * @param atMidpoint - Called when the card is edge-on, to reveal the title.
   * @returns Resolves when the flip is done.
   */
  flip(card: Element, atMidpoint: () => void): Promise<void>;
  /**
   * Pulses an element, such as the done pile when a slip lands on it.
   *
   * @param target - The element.
   * @returns Resolves when it stops.
   */
  pulse(target: Element): Promise<void>;
  /**
   * Leaves a floating copy of a card where it is, before the card disappears.
   *
   * @param card - The card.
   * @returns The copy.
   */
  ghost(card: Element): Ghost;
  /** Finishes everything still running and removes anything that was floating. */
  cancelAll(): void;
}

/** An animator that does nothing, instantly. Used in tests, and wherever there is no screen. */
export const instantAnimator: Animator = {
  wobble: () => Promise.resolve(),
  plop: () => Promise.resolve(),
  shake: () => Promise.resolve(),
  flySlip: () => Promise.resolve(),
  settle: () => Promise.resolve(),
  flip: (_card, atMidpoint) => {
    atMidpoint();
    return Promise.resolve();
  },
  pulse: () => Promise.resolve(),
  ghost: () => ({ flyTo: () => Promise.resolve(), discard: () => undefined }),
  cancelAll: () => undefined,
};

/**
 * Reads a CSS `cubic-bezier(a, b, c, d)` token into the four numbers an animation library wants.
 *
 * @param css - For example `"cubic-bezier(0.3, 0.7, 0.2, 1)"`.
 * @returns The four control values.
 * @throws When the text isn't a cubic-bezier; that is a programmer error in the tokens.
 */
export function parseBezier(css: string): [number, number, number, number] {
  const match = /^cubic-bezier\(\s*([^,]+),\s*([^,]+),\s*([^,]+),\s*([^)]+)\)$/.exec(css);
  const [, a, b, c, d] = match ?? [];
  const values = [a, b, c, d].map(Number);
  if (match === null || values.some((v) => Number.isNaN(v)))
    throw new Error(`Not a cubic-bezier: ${css}`);
  return values as [number, number, number, number];
}

/**
 * Where something is, as the centre of its box.
 *
 * @param rect - A bounding box.
 * @returns Its centre.
 */
export function centreOf(rect: Pick<DOMRect, "left" | "top" | "width" | "height">): Point {
  return { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 };
}

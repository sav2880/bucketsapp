// SPDX-License-Identifier: Apache-2.0

/**
 * Selection and ordering rules for the item list, kept apart from the screen so they can be
 * tested on their own.
 */

/** Which modifier keys were held during a click. */
export interface ClickModifiers {
  /** ⌘ on macOS, Ctrl elsewhere: add or remove one row. */
  toggle: boolean;
  /** Shift: extend from the anchor row. */
  range: boolean;
}

/**
 * Works out the new selection after a click on a row.
 *
 * @param order - Row ids in display order.
 * @param selected - Currently selected ids.
 * @param anchor - The row a range starts from, if any.
 * @param clicked - The row clicked.
 * @param modifiers - Keys held.
 * @returns The new selection (in display order) and the new anchor.
 */
export function nextSelection(
  order: readonly string[],
  selected: readonly string[],
  anchor: string | undefined,
  clicked: string,
  modifiers: ClickModifiers,
): { selected: string[]; anchor: string } {
  if (modifiers.range && anchor !== undefined && order.includes(anchor)) {
    const [a, b] = [order.indexOf(anchor), order.indexOf(clicked)].sort((x, y) => x - y);
    return { selected: order.slice(a, (b ?? 0) + 1), anchor };
  }
  if (modifiers.toggle) {
    const next = selected.includes(clicked)
      ? selected.filter((id) => id !== clicked)
      : [...selected, clicked];
    return { selected: order.filter((id) => next.includes(id)), anchor: clicked };
  }
  return { selected: [clicked], anchor: clicked };
}

/**
 * Moves the chosen rows one place up or down, as a block, keeping their order among themselves.
 *
 * @param order - Row ids in display order.
 * @param ids - Rows to move.
 * @param delta - `-1` for up, `1` for down.
 * @returns The new order; unchanged when the rows are already at that edge.
 */
export function moveBy(order: readonly string[], ids: readonly string[], delta: -1 | 1): string[] {
  const next = [...order];
  const chosen = new Set(ids);
  const indexes = delta === -1 ? next.keys() : [...next.keys()].reverse();
  for (const i of indexes) {
    const id = next[i];
    const neighbor = next[i + delta];
    if (id === undefined || !chosen.has(id) || neighbor === undefined || chosen.has(neighbor))
      continue;
    next[i + delta] = id;
    next[i] = neighbor;
  }
  return next;
}

/**
 * Drops rows before another row (or at the end), for drag and drop.
 *
 * @param order - Row ids in display order.
 * @param ids - Rows being dragged.
 * @param before - The row they are dropped on, or `undefined` to drop at the end.
 * @returns The new order.
 */
export function moveBefore(
  order: readonly string[],
  ids: readonly string[],
  before: string | undefined,
): string[] {
  const moving = order.filter((id) => ids.includes(id));
  const rest = order.filter((id) => !ids.includes(id));
  const at = before === undefined || ids.includes(before) ? rest.length : rest.indexOf(before);
  return [...rest.slice(0, at), ...moving, ...rest.slice(at)];
}

/**
 * Turns pasted text into item titles: one per non-empty line, without list markers such as
 * `-`, `*`, `•` or `1.`.
 *
 * @param text - Pasted text.
 * @returns The titles.
 */
export function titlesFromPaste(text: string): string[] {
  return text
    .split(/\r?\n/)
    .map((line) =>
      line
        .trim()
        .replace(/^(?:[-*•]|\d+[.)])\s+/, "")
        .trim(),
    )
    .filter((line) => line !== "");
}

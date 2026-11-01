// SPDX-License-Identifier: Apache-2.0

import { useEffect, useState, type ReactElement, type ReactNode } from "react";

/** Props for {@link BucketTooltip}. */
export interface BucketTooltipProps {
  /** What to say. Nothing is shown when this is empty. */
  text: string;
  /** The bucket and the Draw button. */
  children: ReactNode;
}

/**
 * Explains why the bucket is covered, and when it opens, while the pointer is over the bucket
 * drawing or the Draw button has keyboard focus (not after a mouse click, when the line below
 * the button already says it). Escape hides it, and it stays while the pointer is over it
 * (WCAG 1.4.13).
 *
 * It repeats the line that is always shown under the Draw button, which is what screen readers
 * read, so it is hidden from them to avoid saying everything twice.
 *
 * @param props - See {@link BucketTooltipProps}.
 * @returns The wrapper.
 */
export function BucketTooltip({ text, children }: BucketTooltipProps): ReactElement {
  const [pointerOver, setPointerOver] = useState(false);
  const [focused, setFocused] = useState(false);
  const [dismissed, setDismissed] = useState(false);
  const wanted = (pointerOver || focused) && text !== "" && !dismissed;

  useEffect(() => {
    if (!wanted) return;
    const onKey = (event: KeyboardEvent): void => {
      if (event.key === "Escape") setDismissed(true);
    };
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("keydown", onKey);
    };
  }, [wanted]);

  /** Records where attention is; once it has left, Escape's hiding no longer applies. */
  const attend = (pointer: boolean, focus: boolean): void => {
    setPointerOver(pointer);
    setFocused(focus);
    if (!pointer && !focus) setDismissed(false);
  };

  return (
    // A wrapper that only listens: the controls inside are what people use.
    <div
      className="bk-stage"
      onPointerOver={(event) => {
        const overArt =
          event.target instanceof Element && event.target.closest(".bk-art, .bk-tooltip") !== null;
        attend(overArt, focused);
      }}
      onPointerLeave={() => {
        attend(false, focused);
      }}
      onFocus={(event) => {
        // Only for keyboard focus; a click also focuses the button and needs no second message.
        attend(pointerOver, event.target.matches(":focus-visible"));
      }}
      onBlur={() => {
        attend(pointerOver, false);
      }}
    >
      {wanted && (
        // The words are drawn by CSS from `data-text`, so they are not part of the page text:
        // the line under the Draw button is the one that is read.
        <div
          className="bk-tooltip"
          aria-hidden="true"
          data-text={text}
          data-testid="bucket-tooltip"
        />
      )}
      {children}
    </div>
  );
}

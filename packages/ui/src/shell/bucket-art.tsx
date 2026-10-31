// SPDX-License-Identifier: Apache-2.0

import { useId, type ReactElement, type Ref } from "react";
import { useMotionPreference } from "../hooks/use-motion-preference";
import { slipLayout, type Mood } from "./bucket-art-model";

/** Props for {@link BucketArt}. */
export interface BucketArtProps {
  /** Items waiting to be drawn; sets how full the bucket looks. */
  inCount: number;
  /** Items cooling down, drawn as greyed slips. */
  restingCount: number;
  /** Whether the lid is on. */
  lidOn: boolean;
  /** The bucket's expression. */
  mood: Mood;
  /** Accessible name, for example "Games, 4 items ready to draw". */
  label: string;
  /** The group that animations move (wobble, plop, shake). */
  bodyRef?: Ref<SVGGElement>;
}

/** The faces. Eyes and mouths are paths in drawing units so they scale with the bucket. */
const FACES: Record<Mood, ReactElement> = {
  idle: (
    <>
      <circle className="bk-face-part" cx="112" cy="142" r="5" />
      <circle className="bk-face-part" cx="148" cy="142" r="5" />
      <path className="bk-face-line" d="M118 156 Q130 166 142 156" />
    </>
  ),
  wow: (
    <>
      <circle className="bk-face-part" cx="112" cy="140" r="6" />
      <circle className="bk-face-part" cx="148" cy="140" r="6" />
      <ellipse className="bk-face-part" cx="130" cy="160" rx="6" ry="7.5" />
    </>
  ),
  happy: (
    <>
      <path className="bk-face-line" d="M105 144 Q112 134 119 144" />
      <path className="bk-face-line" d="M141 144 Q148 134 155 144" />
      <path className="bk-face-line" d="M114 154 Q130 172 146 154" />
    </>
  ),
  wait: (
    <>
      <circle className="bk-face-part" cx="117" cy="142" r="5" />
      <circle className="bk-face-part" cx="153" cy="142" r="5" />
      <path className="bk-face-line" d="M121 158 L139 158" />
    </>
  ),
  sleep: (
    <>
      <path className="bk-face-line" d="M105 141 Q112 147 119 141" />
      <path className="bk-face-line" d="M141 141 Q148 147 155 141" />
      <path className="bk-face-line" d="M125 159 Q130 162 135 159" />
    </>
  ),
  no: (
    <>
      <circle className="bk-face-part" cx="112" cy="142" r="5" />
      <circle className="bk-face-part" cx="148" cy="142" r="5" />
      <path className="bk-face-line" d="M120 161 Q130 153 140 161" />
    </>
  ),
};

/**
 * The bucket: an enamel pail in the bucket's own color, with folded paper slips poking out of
 * the top (more when fuller), a face, and a lid that covers it when drawing isn't allowed.
 * Shades come from `--enamel` in CSS, so any bucket color and both themes work. With motion
 * reduced the lid fades instead of sliding.
 *
 * Animations (wobble, plop, shake) move the `bodyRef` group from outside; this component only
 * draws the resting picture.
 *
 * @param props - See {@link BucketArtProps}.
 * @returns The SVG.
 */
export function BucketArt({
  inCount,
  restingCount,
  lidOn,
  mood,
  label,
  bodyRef,
}: BucketArtProps): ReactElement {
  const gradientId = useId();
  const reduced = useMotionPreference();
  const slips = slipLayout(inCount, restingCount);
  return (
    <svg
      className={`bk-art${lidOn ? " bk-lid-on" : ""}`}
      data-reduced={reduced ? "" : undefined}
      viewBox="0 0 260 250"
      role="img"
      aria-label={label}
      data-testid="bucket-art"
    >
      <defs>
        <linearGradient id={gradientId} x1="0" x2="1" y1="0" y2="0">
          <stop offset="0" className="bk-g-light" />
          <stop offset="0.55" className="bk-g-mid" />
          <stop offset="1" className="bk-g-dark" />
        </linearGradient>
      </defs>
      <ellipse className="bk-shadow" cx="130" cy="234" rx="86" ry="9" />
      <g ref={bodyRef} className="bk-body">
        <path className="bk-handle" d="M38 74 C 44 -6, 216 -6, 222 74" />
        <ellipse className="bk-interior" cx="130" cy="70" rx="93" ry="19" />
        <path className="bk-rim" d="M35 70 A95 20 0 0 1 225 70" />
        <g className="bk-slips" data-testid="bucket-slips">
          {slips.map((slip) => (
            <g
              // A spot holds at most one slip of each kind, so this is unique.
              key={`${slip.resting ? "r" : "i"}-${String(slip.x)}`}
              transform={`translate(${String(slip.x)} ${String(slip.y)}) rotate(${String(slip.rotation)})`}
            >
              <rect
                className={`bk-slip${slip.resting ? " bk-resting" : ""}`}
                x="-11"
                y="0"
                width="22"
                height="64"
                rx="2"
              />
              {!slip.resting && (
                <rect className="bk-slip-band" x="-11" y="0" width="22" height="5" rx="2" />
              )}
            </g>
          ))}
        </g>
        <path
          className="bk-front"
          d="M35 70 L60 218 A70 14 0 0 0 200 218 L225 70 A95 20 0 0 1 35 70 Z"
          fill={`url(#${gradientId})`}
        />
        <path className="bk-ring" d="M41 104 Q130 128 219 104" />
        <path className="bk-ring" d="M56 196 Q130 216 204 196" />
        <path className="bk-sheen" d="M58 88 L72 200" />
        <path className="bk-rim" d="M35 70 A95 20 0 0 0 225 70" />
        <circle className="bk-rivet" cx="40" cy="80" r="5" />
        <circle className="bk-rivet" cx="220" cy="80" r="5" />
        <g className="bk-face" aria-hidden="true" data-mood={mood}>
          <ellipse className="bk-cheek" cx="99" cy="156" rx="8" ry="4.5" />
          <ellipse className="bk-cheek" cx="161" cy="156" rx="8" ry="4.5" />
          {FACES[mood]}
        </g>
        <g className={`bk-lid${lidOn ? " on" : ""}`} data-testid="bucket-lid">
          <ellipse className="bk-lid-edge" cx="130" cy="72" rx="100" ry="22" />
          <ellipse className="bk-lid-top" cx="130" cy="67" rx="100" ry="22" />
          <ellipse className="bk-lid-shine" cx="102" cy="60" rx="38" ry="7" />
          <rect className="bk-lid-knob" x="116" y="50" width="28" height="13" rx="6.5" />
        </g>
      </g>
    </svg>
  );
}

# ADR 0003: Decisions made while building M3 (bucket visuals)

- **Status:** accepted (2026-10-31), pending maintainer review of the M3 change
- **Context:** plan.md §12.3 described the bucket, its lid and its animations, but left open how to drive the animations, how to sequence them with data changes, and how to keep them accessible. The frozen prototype in `docs/prototype/` was the reference.

## Decisions

### 1. Motion, behind an `Animator` interface

plan.md names Motion (MIT), so it is used (`motion` 14.x, only `animate`). Everything the bucket does on screen goes through the `Animator` interface (`wobble`, `plop`, `shake`, `flySlip`, `settle`, `flip`, `pulse`, `ghost`, `cancelAll`). There are three implementations: the full set (`createMotionAnimator`), a fade-only set for reduced motion (`createFadeAnimator`), and an instant no-op (`instantAnimator`) for tests. The sequencing in `useChoreography` talks only to the interface, so it is tested with a recording animator in jsdom, which has no animation support. The real animators are thin and covered by tests that mock `animate` and by Playwright.

### 2. State first, animation second

As in the prototype, the command runs and the data changes at once; the animation covers the already-changed view. A card for a new draw is rendered hidden (and `inert`) so the slip has somewhere to land; a card leaving the hand is copied (a "ghost") before the command removes it. This keeps data and display consistent even if an animation fails, and it means the animation can never be the reason a change is lost.

### 3. One lock, with a safety timeout

A `busy` flag blocks a second draw, finish or toss back (including the shortcuts) while a sequence runs, because two sequences would fight over the hidden-card state. It is released after at most 6 seconds whatever the animator does, and animation errors are swallowed. The Draw button looks and reports as unavailable while busy, so a quick click is never silently ignored.

### 4. Announce first

The prototype announced a result when the animation ended. Screen-reader users shouldn't wait on a decorative effect, so the message is made when the data changes. Flying pieces are `aria-hidden`, and a card is `inert` while hidden, so a Mystery Bag title can't leak through the accessibility tree during the flip.

### 5. Reduced motion has one source of truth

`useMotionPreference` (system setting plus the in-app Motion choice) is the only gate; Motion's own detection is not used. Under reduced motion cards fade in, copies fade out, the lid fades instead of sliding, and nothing rocks or flies. plan.md asks for "simple fades", and the prototype just cut to the end state; fades keep the sense of something appearing. The in-app choice is stored in the device settings and shown in the bucket details for now.

### 6. The Draw button is `aria-disabled`

A `disabled` button can't be focused or pressed, so it can't say why. With `aria-disabled` it stays in the tab order and pressing it shakes the bucket and announces the reason, which is also how the prototype behaved. Playwright treats such a button as not enabled, so its tests use a forced click for the refusal case.

### 7. The explanation over the bucket is visual only

It shows on hover over the drawing and on keyboard focus of the Draw button (not after a click, since the text under the button already says it), and Escape hides it. It repeats the always-visible hint, so its words are drawn by CSS from `data-text` and it is `aria-hidden`: screen readers read the hint once. This departs from plan.md's `role="tooltip"` because a tooltip role would make assistive technology say everything twice.

### 8. The face stays

The prototype's face gives state at a glance without relying on the lid alone (asleep when everything is resting, waiting when something must be finished). plan.md did not mention it; it is now recorded in §12.3a.

### 9. Only transform and opacity

All animation is `transform` and `opacity`, so the browser can run it off the main thread. `pnpm measure:frames` confirmed it: with the CPU slowed 6× a 5-item bucket held 16.7 ms frames with no frame over 20 ms, and the animated properties were exactly `opacity` and `transform`.

## Consequences and known gaps

- **Large buckets:** with 500 items the animation stayed smooth, but each draw or finish re-rendered every list row, giving stalls of about 50 ms (417 ms with the CPU slowed 6×). This was fixed straight after M3 by drawing only the visible rows (plan.md §12.4b), with `@tanstack/react-virtual` added for it. At 500 items there are now no frames over 20 ms at normal speed, and two short stalls (117 ms and 200 ms) at 4× and 6× slower, which are data work rather than drawing.
- **Not simulated by jsdom:** `:focus-visible` and real animation. The click-versus-keyboard behavior of the explanation and the sequences are checked by Playwright on Chromium and WebKit (Firefox runs in CI; WebKit skips the Tab test because Safari doesn't Tab onto buttons by default).
- **Deferred:** holder avatars and live draws by other members (M9); optional sound effects.
- **Human checks remain:** the usability sessions (`docs/design/m3-usability-check.md`) and the frame-rate check on modest real hardware.
- **Dependency:** `motion` adds about 80 kB (about 30 kB gzipped) to the web build.

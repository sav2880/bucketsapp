# M3 usability check: the bucket

A short session script for 3–5 people. It tests whether the bucket, its lid, and its animations make sense to someone who has never seen the app. It is one of the two exit criteria for M3 (plan.md §15); the other is the frame-rate check (`pnpm measure:frames`).

**You run the sessions.** Aim for about 15 minutes each, and mix the people: someone who uses a to-do style app every day, someone who doesn't, and, if you can, one person who uses a screen reader or has "reduce motion" switched on.

## Setup

- A fresh profile, so the app is empty: the web build in a new browser window, or the desktop app with an empty data folder.
- Screen sharing or a screen recording, with the person's permission. Notes on paper are fine.
- Say this, and nothing more: "This app is a bucket you put things in and draw from. Please think out loud. I can't help during the tasks, because I want to see what's unclear. You can't do anything wrong."

## Tasks

Give each task as a goal, not as steps. Don't name buttons.

1. **Make a bucket and put five things in it.** (Anything: games to play, chores, meals.)
2. **Pick something out of the bucket.** *Watch:* do they find Draw? Do they watch the slip fly? Do they say what they think just happened?
3. **Say what you'd do next, and do it.** *Watch:* do they find Done and Toss back without help, and can they say how the two differ?
4. **Try to pick another one straight away.** *Watch:* the bucket is covered and the button looks off. Do they understand why, without reading the text under the button? Do they press the button anyway? Do they notice the explanation when they hover over the bucket?
5. **Make a Mystery Bag and pick from it.** *Watch:* do they understand that the title is hidden until the card turns over? Are they surprised in a good way or a worried way?
6. **Switch motion off** (the "Motion" choice in the bucket's details), **then draw again.** *Watch:* is it still clear what happened when nothing flies?

If they use a screen reader, do tasks 2–4 with it, and note whether the result of a draw is read out at once, and whether the bucket's name ("Games, 4 items ready to draw") is useful.

## What to write down for each task

- Did they finish it on their own? (Yes, with a hint, or no.)
- How long did it take, roughly?
- The words they used for things. If they say "pail", "slip" or "pull" and the app says something else, that's useful.
- Anything they did twice, pressed in the wrong place, or said they expected.
- Anything the animation made unclear, too slow, or too long. The draw takes about 1.2 seconds in all.

## Questions at the end

1. In your own words, what is the bucket for?
2. When the bucket had its lid on, what did that mean to you?
3. Was anything too slow, too busy, or too cute?
4. Did you feel in control while the animation played, or did you want to click ahead?
5. Would you want to use this? What would you put in it?

## How to decide

M3 passes when, across the people you tested:

- At least 4 in 5 (or all of 3) finish tasks 1–4 without a hint.
- Nobody is confused for more than a moment about why the bucket is covered.
- Nobody says the animation got in the way. If two people do, shorten it.
- Reduced motion is still understandable (task 6).

Write the results up in a short note next to this file, with the changes you decided on. The animation timings are all in one place (`motion.ms` in `packages/ui/src/tokens/index.ts`), so they are easy to adjust.

// SPDX-License-Identifier: Apache-2.0

import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { DAY, T0, applyOk, idMaker, makeBucket, request } from "../../test/builders";
import { draw } from "../engine/draw";
import { resolve } from "../engine/resolve";
import { createSeededRng } from "../random/rng";
import { BUCKET_COLORS, isBucketColor } from "./bucket-colors";
import {
  addBucketRef,
  addStep,
  createBucket,
  createLibrary,
  type CommandContext,
} from "./commands";
import {
  addAttachment,
  addLink,
  convertItemToStep,
  convertStepToItem,
  normalizeLinkUrl,
  removeAttachment,
  removeBucketRef,
  removeItem,
  removeLink,
  removeStep,
  renameBucket,
  reorderBuckets,
  reorderSteps,
  setAttachmentAlt,
  setBucketColor,
  setBucketIcon,
  setItemNotes,
  setItemTags,
  setItemTitle,
  setLinkTitle,
  setStepTitle,
} from "./edit";
import { prepareMove, receiveMovedItem } from "./move";
import type { Bucket, MemberRole } from "./types";

const NOW = new Date(T0);

function ctxFor(memberId = "me", prefix = "n"): CommandContext {
  return { memberId, now: NOW, makeId: idMaker(prefix) };
}

function ok<T>(result: { ok: true; value: T } | { ok: false; reason: string }): T {
  if (!result.ok) throw new Error(`expected success, got ${result.reason}`);
  return result.value;
}

function refusal(result: { ok: boolean; reason?: string }): string | undefined {
  return result.ok ? undefined : result.reason;
}

function withRole(role: MemberRole): Bucket {
  return makeBucket({ items: 3, members: { you: role } });
}

/** True when no value anywhere inside is `undefined`, which Automerge cannot store. */
function hasNoUndefined(value: unknown): boolean {
  if (value === undefined) return false;
  if (Array.isArray(value)) return value.every(hasNoUndefined);
  if (value !== null && typeof value === "object")
    return Object.values(value).every(hasNoUndefined);
  return true;
}

describe("item fields", () => {
  it("renames, trims and refuses blank titles", () => {
    const bucket = makeBucket({ items: 2 });
    ok(setItemTitle(bucket, "i0", "  Hades  ", ctxFor()));
    expect(bucket.items["i0"]?.title).toBe("Hades");
    expect(refusal(setItemTitle(bucket, "i0", "   ", ctxFor()))).toBe("empty-title");
    expect(refusal(setItemTitle(bucket, "nope", "x", ctxFor()))).toBe("unknown-item");
  });

  it("sets notes and removes the field when they are blank", () => {
    const bucket = makeBucket({ items: 1 });
    ok(setItemNotes(bucket, "i0", "Bring snacks", ctxFor()));
    expect(bucket.items["i0"]?.notes).toBe("Bring snacks");
    ok(setItemNotes(bucket, "i0", "  ", ctxFor()));
    expect("notes" in (bucket.items["i0"] ?? {})).toBe(false);
  });

  it("cleans tags: trims, drops blanks, keeps the first of any repeat ignoring case", () => {
    const bucket = makeBucket({ items: 1 });
    ok(setItemTags(bucket, "i0", [" Co-op ", "", "co-op", "Solo", "SOLO"], ctxFor()));
    expect(bucket.items["i0"]?.tags).toEqual(["Co-op", "Solo"]);
  });

  it("removes an item from the bucket and its order, and its old events are ignored", () => {
    const bucket = makeBucket({ items: 2 });
    const makeId = idMaker("e");
    applyOk(bucket, draw(bucket, request(createSeededRng(1), T0, makeId)));
    ok(removeItem(bucket, "i0", ctxFor()));
    ok(removeItem(bucket, "i1", ctxFor()));
    expect(bucket.items).toEqual({});
    expect(bucket.itemOrder).toEqual([]);
    expect(refusal(removeItem(bucket, "i0", ctxFor()))).toBe("unknown-item");
  });

  it.each(["viewer", "drawer"] as const)("refuses edits from a %s", (role) => {
    const bucket = withRole(role);
    const ctx = ctxFor("you");
    expect(refusal(setItemTitle(bucket, "i0", "x", ctx))).toBe("not-permitted");
    expect(refusal(setItemNotes(bucket, "i0", "x", ctx))).toBe("not-permitted");
    expect(refusal(setItemTags(bucket, "i0", [], ctx))).toBe("not-permitted");
    expect(refusal(removeItem(bucket, "i0", ctx))).toBe("not-permitted");
    expect(refusal(renameBucket(bucket, "x", ctx))).toBe("not-permitted");
    expect(refusal(setBucketIcon(bucket, "star", ctx))).toBe("not-permitted");
    expect(refusal(setBucketColor(bucket, "blue", ctx))).toBe("not-permitted");
  });
});

describe("steps", () => {
  const stepped = (): Bucket => {
    const bucket = makeBucket({ items: 2 });
    const ctx = ctxFor();
    for (const title of ["a", "b", "c"]) ok(addStep(bucket, "i0", title, ctx));
    return bucket;
  };
  const ids = (bucket: Bucket): string[] => bucket.items["i0"]?.steps.map((s) => s.id) ?? [];

  it("renames and removes steps", () => {
    const bucket = stepped();
    const [first = "", second = ""] = ids(bucket);
    ok(setStepTitle(bucket, "i0", first, " Alpha ", ctxFor()));
    expect(bucket.items["i0"]?.steps[0]?.title).toBe("Alpha");
    expect(refusal(setStepTitle(bucket, "i0", first, "", ctxFor()))).toBe("empty-title");
    expect(refusal(setStepTitle(bucket, "i0", "zz", "x", ctxFor()))).toBe("unknown-step");
    ok(removeStep(bucket, "i0", second, ctxFor()));
    expect(bucket.items["i0"]?.steps.map((s) => s.title)).toEqual(["Alpha", "c"]);
    expect(refusal(removeStep(bucket, "i0", second, ctxFor()))).toBe("unknown-step");
  });

  it("reorders steps, keeping their progress, and refuses anything but a permutation", () => {
    const bucket = stepped();
    const [a = "", b = "", c = ""] = ids(bucket);
    const first = bucket.items["i0"]?.steps[0];
    if (first) first.done = true;
    ok(reorderSteps(bucket, "i0", [c, a, b], ctxFor()));
    expect(bucket.items["i0"]?.steps.map((s) => s.title)).toEqual(["c", "a", "b"]);
    expect(bucket.items["i0"]?.steps[1]?.done).toBe(true);
    for (const bad of [
      [a, b],
      [a, a, b],
      [a, b, "zz"],
      [a, b, c, c],
    ])
      expect(refusal(reorderSteps(bucket, "i0", bad, ctxFor()))).toBe("invalid-order");
    expect(refusal(reorderSteps(bucket, "nope", [], ctxFor()))).toBe("unknown-item");
  });

  it("turns a plain item into a step of another item (Tab)", () => {
    const bucket = makeBucket({ items: 3 });
    const stepId = ok(convertItemToStep(bucket, "i1", "i0", ctxFor()));
    expect(bucket.items["i1"]).toBeUndefined();
    expect(bucket.itemOrder).toEqual(["i0", "i2"]);
    expect(bucket.items["i0"]?.steps).toEqual([{ id: stepId, title: "Item 1", done: false }]);
  });

  it("won't turn an item into a step when that would lose something", () => {
    const bucket = makeBucket({ items: 5 });
    const ctx = ctxFor();
    ok(addStep(bucket, "i1", "has a step", ctx));
    ok(addLink(bucket, "i2", "https://example.com", ctx));
    ok(
      addAttachment(
        bucket,
        "i3",
        { blobId: "b", mime: "image/png", width: 1, height: 1, bytes: 1 },
        ctx,
      ),
    );
    const child = bucket.items["i4"];
    if (child) child.childBucketId = "other";
    expect(refusal(convertItemToStep(bucket, "i1", "i0", ctx))).toBe("item-has-content");
    expect(refusal(convertItemToStep(bucket, "i2", "i0", ctx))).toBe("item-has-content");
    expect(refusal(convertItemToStep(bucket, "i3", "i0", ctx))).toBe("item-has-content");
    expect(refusal(convertItemToStep(bucket, "i4", "i0", ctx))).toBe("item-has-child-bucket");
    expect(refusal(convertItemToStep(bucket, "i0", "i0", ctx))).toBe("invalid-order");
    expect(refusal(convertItemToStep(bucket, "i0", "nope", ctx))).toBe("unknown-item");
  });

  it("won't turn an item with draw history into a step", () => {
    const bucket = makeBucket({ items: 2 });
    const [drawn = ""] = applyOk(
      bucket,
      draw(bucket, request(createSeededRng(3), T0, idMaker("e"))),
    );
    const other = drawn === "i0" ? "i1" : "i0";
    expect(refusal(convertItemToStep(bucket, drawn, other, ctxFor()))).toBe("item-has-content");
  });

  it("turns a step into an item right after its parent (Shift-Tab)", () => {
    const bucket = stepped();
    const [, b = ""] = ids(bucket);
    const id = ok(convertStepToItem(bucket, "i0", b, ctxFor()));
    expect(bucket.itemOrder).toEqual(["i0", id, "i1"]);
    expect(bucket.items[id]).toMatchObject({ title: "b", weight: 1, steps: [], createdBy: "me" });
    expect(bucket.items["i0"]?.steps.map((s) => s.title)).toEqual(["a", "c"]);
    expect(refusal(convertStepToItem(bucket, "i0", "zz", ctxFor()))).toBe("unknown-step");
    expect(refusal(convertStepToItem(bucket, "nope", b, ctxFor()))).toBe("unknown-item");
  });
});

describe("links", () => {
  it.each([
    ["https://example.com", true],
    ["  http://example.com/a?b=c#d  ", true],
    ["HTTPS://EXAMPLE.COM", true],
    ["mailto:me@example.com", true],
    ["javascript:alert(1)", false],
    ["data:text/html,hi", false],
    ["file:///etc/passwd", false],
    ["ftp://example.com", false],
    ["https://", false],
    ["https:///nohost", false],
    ["https://exa mple.com", false],
    ["mailto:nobody", false],
    ["example.com", false],
    ["", false],
  ])("checks %j", (url, accepted) => {
    expect(normalizeLinkUrl(url) !== undefined).toBe(accepted);
  });

  it("adds, labels and removes links", () => {
    const bucket = makeBucket({ items: 1 });
    const ctx = ctxFor();
    const id = ok(addLink(bucket, "i0", " https://example.com/x ", ctx, "  Guide "));
    expect(bucket.items["i0"]?.links).toEqual([
      { id, url: "https://example.com/x", title: "Guide" },
    ]);
    ok(setLinkTitle(bucket, "i0", id, "", ctx));
    expect(bucket.items["i0"]?.links[0]).toEqual({ id, url: "https://example.com/x" });
    ok(setLinkTitle(bucket, "i0", id, "Docs", ctx));
    expect(bucket.items["i0"]?.links[0]?.title).toBe("Docs");
    expect(refusal(setLinkTitle(bucket, "i0", "zz", "x", ctx))).toBe("unknown-link");
    ok(removeLink(bucket, "i0", id, ctx));
    expect(bucket.items["i0"]?.links).toEqual([]);
    expect(refusal(removeLink(bucket, "i0", id, ctx))).toBe("unknown-link");
    expect(refusal(addLink(bucket, "i0", "javascript:1", ctx))).toBe("invalid-url");
    expect(refusal(addLink(bucket, "nope", "https://a.b", ctx))).toBe("unknown-item");
  });

  it("ignores a blank label when adding", () => {
    const bucket = makeBucket({ items: 1 });
    ok(addLink(bucket, "i0", "https://a.b", ctxFor(), "   "));
    expect(bucket.items["i0"]?.links[0]).not.toHaveProperty("title");
  });
});

describe("images", () => {
  const image = {
    blobId: "abc",
    mime: "image/webp",
    width: 800,
    height: 600,
    bytes: 12_345,
  } as const;

  it("adds, describes and removes images", () => {
    const bucket = makeBucket({ items: 1 });
    const ctx = ctxFor();
    const id = ok(addAttachment(bucket, "i0", { ...image, alt: "  A bucket  " }, ctx));
    expect(bucket.items["i0"]?.attachments[0]).toEqual({ ...image, id, alt: "A bucket" });
    ok(setAttachmentAlt(bucket, "i0", id, "", ctx));
    expect(bucket.items["i0"]?.attachments[0]).not.toHaveProperty("alt");
    ok(setAttachmentAlt(bucket, "i0", id, "Blue bucket", ctx));
    expect(bucket.items["i0"]?.attachments[0]?.alt).toBe("Blue bucket");
    expect(refusal(setAttachmentAlt(bucket, "i0", "zz", "x", ctx))).toBe("unknown-attachment");
    ok(removeAttachment(bucket, "i0", id, ctx));
    expect(bucket.items["i0"]?.attachments).toEqual([]);
    expect(refusal(removeAttachment(bucket, "i0", id, ctx))).toBe("unknown-attachment");
  });

  it("refuses an image with no blob or a bad size", () => {
    const bucket = makeBucket({ items: 1 });
    for (const bad of [
      { ...image, blobId: "" },
      { ...image, width: 0 },
      { ...image, height: 1.5 },
      { ...image, bytes: -1 },
    ])
      expect(refusal(addAttachment(bucket, "i0", bad, ctxFor()))).toBe("invalid-attachment");
    expect(refusal(addAttachment(bucket, "nope", image, ctxFor()))).toBe("unknown-item");
  });
});

describe("buckets and the library", () => {
  it("renames, re-icons and recolors a bucket", () => {
    const bucket = makeBucket();
    ok(renameBucket(bucket, "  Games  ", ctxFor()));
    ok(setBucketIcon(bucket, " star ", ctxFor()));
    ok(setBucketColor(bucket, "teal", ctxFor()));
    expect(bucket).toMatchObject({ name: "Games", icon: "star", color: "teal" });
    expect(refusal(renameBucket(bucket, " ", ctxFor()))).toBe("empty-title");
    expect(refusal(setBucketIcon(bucket, "", ctxFor()))).toBe("empty-title");
    expect(refusal(setBucketColor(bucket, "#ff0000", ctxFor()))).toBe("invalid-color");
  });

  it("knows its color names", () => {
    expect(BUCKET_COLORS).toContain("accent");
    expect(BUCKET_COLORS.every(isBucketColor)).toBe(true);
    expect(isBucketColor("magenta")).toBe(false);
  });

  it("creates buckets with a color name it accepts", () => {
    const bucket = createBucket({ name: "x", ownerName: "Me" }, ctxFor());
    expect(isBucketColor(bucket.color)).toBe(true);
  });

  const libraryWith = (...ids: string[]) => {
    const library = createLibrary("Me", ctxFor());
    for (const bucketId of ids)
      addBucketRef(library, { bucketId, keyId: "k", role: "owner", addedAt: NOW.toISOString() });
    library.reminders["b"] = [];
    return library;
  };

  it("removes a bucket pointer and its personal reminders", () => {
    const library = libraryWith("a", "b", "c");
    const ref = ok(removeBucketRef(library, "b"));
    expect(ref.bucketId).toBe("b");
    expect(library.bucketOrder).toEqual(["a", "c"]);
    expect(Object.keys(library.buckets)).toEqual(["a", "c"]);
    expect(library.reminders).toEqual({});
    expect(refusal(removeBucketRef(library, "b"))).toBe("unknown-bucket");
  });

  it("reorders buckets and refuses anything but a permutation", () => {
    const library = libraryWith("a", "b", "c");
    ok(reorderBuckets(library, ["c", "a", "b"]));
    expect(library.bucketOrder).toEqual(["c", "a", "b"]);
    for (const bad of [
      ["a", "b"],
      ["a", "a", "b"],
      ["a", "b", "z"],
    ])
      expect(refusal(reorderBuckets(library, bad))).toBe("invalid-order");
  });
});

describe("moving an item to another bucket", () => {
  const richItem = (): Bucket => {
    const bucket = makeBucket({ items: 2 });
    const ctx = ctxFor();
    ok(setItemNotes(bucket, "i0", "Notes", ctx));
    ok(setItemTags(bucket, "i0", ["x"], ctx));
    ok(addStep(bucket, "i0", "step", ctx));
    ok(addLink(bucket, "i0", "https://example.com", ctx));
    ok(
      addAttachment(
        bucket,
        "i0",
        { blobId: "b", mime: "image/png", width: 2, height: 2, bytes: 9 },
        ctx,
      ),
    );
    return bucket;
  };

  it("copies the whole definition without touching the source", () => {
    const source = richItem();
    const before = JSON.stringify(source);
    const moved = ok(prepareMove(source, "i0", ctxFor()));
    expect(JSON.stringify(source)).toBe(before);
    expect(moved).toEqual(source.items["i0"]);
    expect(moved).not.toBe(source.items["i0"]);
    expect(moved.steps[0]).not.toBe(source.items["i0"]?.steps[0]);
  });

  it("adds the item to the destination with its id and leaves history behind", () => {
    const source = richItem();
    const destination = makeBucket({ items: 0 });
    const moved = ok(prepareMove(source, "i0", ctxFor()));
    const id = ok(receiveMovedItem(destination, moved, ctxFor()));
    expect(id).toBe("i0");
    expect(destination.itemOrder).toEqual(["i0"]);
    expect(destination.items["i0"]).toEqual(moved);
    expect(destination.events).toEqual([]);
    ok(removeItem(source, "i0", ctxFor()));
    expect(source.itemOrder).toEqual(["i1"]);
  });

  it("gives the item a fresh id when the destination already uses its id", () => {
    const source = richItem();
    const destination = makeBucket({ items: 1 });
    const id = ok(
      receiveMovedItem(destination, ok(prepareMove(source, "i0", ctxFor())), ctxFor("me", "fresh")),
    );
    expect(id).toBe("fresh-1");
    expect(destination.items["i0"]?.title).toBe("Item 0");
    expect(destination.items[id]?.title).toBe("Item 0");
    expect(destination.itemOrder).toEqual(["i0", id]);
    expect(destination.items[id]?.id).toBe(id);
  });

  it("refuses to move an item someone is holding, but not one that was finished", () => {
    const source = makeBucket({ items: 1, rules: { onDone: "return" } });
    const makeId = idMaker("e");
    applyOk(source, draw(source, request(createSeededRng(1), T0, makeId)));
    expect(refusal(prepareMove(source, "i0", ctxFor()))).toBe("item-in-hand");
    applyOk(
      source,
      resolve(source, {
        itemId: "i0",
        kind: "done",
        memberId: "me",
        deviceId: "d1",
        now: new Date(T0 + DAY),
        makeId,
      }),
    );
    expect(prepareMove(source, "i0", { ...ctxFor(), now: new Date(T0 + 2 * DAY) }).ok).toBe(true);
  });

  it("refuses an item that holds a nested bucket, an unknown item and a non-editor", () => {
    const source = withRole("viewer");
    const child = source.items["i0"];
    if (child) child.childBucketId = "other";
    expect(refusal(prepareMove(source, "i0", ctxFor()))).toBe("item-has-child-bucket");
    expect(refusal(prepareMove(source, "nope", ctxFor()))).toBe("unknown-item");
    expect(refusal(prepareMove(source, "i1", ctxFor("you")))).toBe("not-permitted");
    const moved = ok(prepareMove(source, "i1", ctxFor()));
    expect(refusal(receiveMovedItem(source, moved, ctxFor("you")))).toBe("not-permitted");
  });
});

describe("no command writes undefined", () => {
  it("keeps every document free of undefined values across a mixed run of commands", () => {
    fc.assert(
      fc.property(
        fc.array(
          fc.record({
            op: fc.constantFrom(
              "notes",
              "tags",
              "step",
              "link",
              "image",
              "alt",
              "tab",
              "untab",
              "move",
            ),
            text: fc.string({ maxLength: 12 }),
          }),
          { maxLength: 30 },
        ),
        (steps) => {
          const bucket = makeBucket({ items: 3 });
          const other = makeBucket({ items: 0 });
          const ctx = ctxFor("me", "p");
          for (const { op, text } of steps) {
            const itemId = bucket.itemOrder[0] ?? "";
            const second = bucket.itemOrder[1] ?? "";
            const stepId = bucket.items[itemId]?.steps[0]?.id ?? "";
            const attachmentId = bucket.items[itemId]?.attachments[0]?.id ?? "";
            if (op === "notes") setItemNotes(bucket, itemId, text, ctx);
            else if (op === "tags") setItemTags(bucket, itemId, text.split(""), ctx);
            else if (op === "step") addStep(bucket, itemId, text || "s", ctx);
            else if (op === "link") addLink(bucket, itemId, `https://${text}.example`, ctx, text);
            else if (op === "image")
              addAttachment(
                bucket,
                itemId,
                { blobId: "b", mime: "image/png", width: 1, height: 1, bytes: 1, alt: text },
                ctx,
              );
            else if (op === "alt") setAttachmentAlt(bucket, itemId, attachmentId, text, ctx);
            else if (op === "tab") convertItemToStep(bucket, second, itemId, ctx);
            else if (op === "untab") convertStepToItem(bucket, itemId, stepId, ctx);
            else {
              const moved = prepareMove(bucket, itemId, ctx);
              if (moved.ok) receiveMovedItem(other, moved.value, ctx);
            }
          }
          expect(hasNoUndefined(bucket)).toBe(true);
          expect(hasNoUndefined(other)).toBe(true);
        },
      ),
      { numRuns: 100 },
    );
  });
});

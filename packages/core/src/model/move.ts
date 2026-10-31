// SPDX-License-Identifier: Apache-2.0

import { deriveItems } from "../engine/derive";
import { canEdit, editableItem, type CommandContext, type CommandResult } from "./commands";
import type { Bucket, Item } from "./types";

/**
 * Moving an item between buckets takes two steps, because each bucket is its own document
 * (plan.md §5): {@link prepareMove} copies the definition out of the source, and
 * {@link receiveMovedItem} adds it to the destination. The app applies the destination first
 * and then removes the item from the source with `removeItem`, so a crash in between leaves a
 * duplicate rather than losing the item.
 *
 * The definition moves (title, notes, tags, weight, steps, links, images, archived flag).
 * Draw history stays behind: the destination starts the item fresh.
 */

/** An item's definition, detached from its bucket. */
export type MovedItem = Item;

/**
 * Copies an item's definition so it can be added to another bucket. Does not change `bucket`.
 *
 * @param bucket - Bucket the item is in.
 * @param itemId - The item.
 * @param ctx - Who and when; `now` decides whether the item is in someone's hand.
 * @returns The copy, or a refusal. An item in someone's hand (`item-in-hand`) or one that holds
 *   a nested bucket (`item-has-child-bucket`) cannot move.
 */
export function prepareMove(
  bucket: Bucket,
  itemId: string,
  ctx: CommandContext,
): CommandResult<MovedItem> {
  const found = editableItem(bucket, itemId, ctx);
  if (!found.ok) return found;
  if (found.value.childBucketId !== undefined)
    return { ok: false, reason: "item-has-child-bucket" };
  const state = deriveItems(bucket, ctx.now).find((s) => s.item.id === itemId);
  if (state?.status === "hand") return { ok: false, reason: "item-in-hand" };
  // A JSON round trip detaches the copy from Automerge's live objects.
  return { ok: true, value: JSON.parse(JSON.stringify(found.value)) as MovedItem };
}

/**
 * Adds a moved item at the end of a bucket.
 *
 * @param bucket - Destination bucket.
 * @param moved - The copy from {@link prepareMove}.
 * @param ctx - Who and when.
 * @returns The item's id in the destination, which is its old id unless that id is taken, or a
 *   refusal.
 */
export function receiveMovedItem(
  bucket: Bucket,
  moved: MovedItem,
  ctx: CommandContext,
): CommandResult<string> {
  if (!canEdit(bucket.members[ctx.memberId]?.role)) return { ok: false, reason: "not-permitted" };
  const copy = JSON.parse(JSON.stringify(moved)) as Item;
  if (bucket.items[copy.id]) copy.id = ctx.makeId();
  bucket.items[copy.id] = copy;
  bucket.itemOrder.push(copy.id);
  return { ok: true, value: copy.id };
}

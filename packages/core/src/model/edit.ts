// SPDX-License-Identifier: Apache-2.0

import { isBucketColor } from "./bucket-colors";
import { canEdit, editableItem, type CommandContext, type CommandResult } from "./commands";
import type { Attachment, Bucket, BucketRef, Library, Link } from "./types";

/**
 * Editing commands for items, steps, links, images and buckets. Like the rest of the commands
 * they change what they are given and never write `undefined`, which Automerge rejects.
 */

const OK = { ok: true, value: undefined } as const;

/**
 * Deletes the entry with the given id by splicing it out. Assigning a filtered copy would fail
 * inside Automerge (it cannot re-insert objects already in the document) and would make
 * concurrent edits to the other entries conflict.
 */
function removeById(list: { id: string }[], id: string): void {
  const at = list.findIndex((entry) => entry.id === id);
  if (at >= 0) list.splice(at, 1);
}

/** Same for a list of plain ids. */
function removeId(list: string[], id: string): void {
  const at = list.indexOf(id);
  if (at >= 0) list.splice(at, 1);
}

/**
 * Link shapes we accept: `http(s)://host…` and `mailto:name@host`. Core has no `URL` class (it
 * must stay free of platform APIs), and a strict pattern is safer than parsing anyway:
 * `javascript:`, `data:`, `file:` and friends never match. No whitespace or control characters.
 */
const LINK_PATTERN =
  /^(?:https?:\/\/[^\s/?#\p{Cc}]+[^\s\p{Cc}]*|mailto:[^\s@\p{Cc}]+@[^\s@\p{Cc}]+)$/iu;

/**
 * Checks a link target and returns it trimmed.
 *
 * @param url - What the user typed or pasted.
 * @returns The address, or `undefined` unless it is an `http`, `https` or `mailto` address.
 */
export function normalizeLinkUrl(url: string): string | undefined {
  const trimmed = url.trim();
  return LINK_PATTERN.test(trimmed) ? trimmed : undefined;
}

/**
 * Renames an item.
 *
 * @param bucket - Bucket to change.
 * @param itemId - The item.
 * @param title - New title; must not be blank.
 * @param ctx - Who and when.
 * @returns Success, or a refusal.
 */
export function setItemTitle(
  bucket: Bucket,
  itemId: string,
  title: string,
  ctx: CommandContext,
): CommandResult<undefined> {
  const found = editableItem(bucket, itemId, ctx);
  if (!found.ok) return found;
  const trimmed = title.trim();
  if (trimmed === "") return { ok: false, reason: "empty-title" };
  found.value.title = trimmed;
  return OK;
}

/**
 * Sets an item's notes. Empty notes are removed rather than stored.
 *
 * @param bucket - Bucket to change.
 * @param itemId - The item.
 * @param notes - New notes.
 * @param ctx - Who and when.
 * @returns Success, or a refusal.
 */
export function setItemNotes(
  bucket: Bucket,
  itemId: string,
  notes: string,
  ctx: CommandContext,
): CommandResult<undefined> {
  const found = editableItem(bucket, itemId, ctx);
  if (!found.ok) return found;
  if (notes.trim() === "") delete found.value.notes;
  else found.value.notes = notes;
  return OK;
}

/**
 * Replaces an item's tags. Blank tags are dropped and repeats (ignoring case) are kept once.
 *
 * @param bucket - Bucket to change.
 * @param itemId - The item.
 * @param tags - The new tags.
 * @param ctx - Who and when.
 * @returns Success, or a refusal.
 */
export function setItemTags(
  bucket: Bucket,
  itemId: string,
  tags: readonly string[],
  ctx: CommandContext,
): CommandResult<undefined> {
  const found = editableItem(bucket, itemId, ctx);
  if (!found.ok) return found;
  const seen = new Set<string>();
  const clean: string[] = [];
  for (const tag of tags) {
    const trimmed = tag.trim();
    if (trimmed === "" || seen.has(trimmed.toLowerCase())) continue;
    seen.add(trimmed.toLowerCase());
    clean.push(trimmed);
  }
  found.value.tags = clean;
  return OK;
}

/**
 * Deletes an item. Its past events stay in the history, and the engine ignores events for
 * items that no longer exist.
 *
 * @param bucket - Bucket to change.
 * @param itemId - The item.
 * @param ctx - Who and when.
 * @returns Success, or a refusal.
 */
export function removeItem(
  bucket: Bucket,
  itemId: string,
  ctx: CommandContext,
): CommandResult<undefined> {
  const found = editableItem(bucket, itemId, ctx);
  if (!found.ok) return found;
  Reflect.deleteProperty(bucket.items, itemId);
  removeId(bucket.itemOrder, itemId);
  return OK;
}

/**
 * Renames a step.
 *
 * @param bucket - Bucket to change.
 * @param itemId - The item.
 * @param stepId - The step.
 * @param title - New title; must not be blank.
 * @param ctx - Who and when.
 * @returns Success, or a refusal.
 */
export function setStepTitle(
  bucket: Bucket,
  itemId: string,
  stepId: string,
  title: string,
  ctx: CommandContext,
): CommandResult<undefined> {
  const found = editableItem(bucket, itemId, ctx);
  if (!found.ok) return found;
  const step = found.value.steps.find((s) => s.id === stepId);
  if (!step) return { ok: false, reason: "unknown-step" };
  const trimmed = title.trim();
  if (trimmed === "") return { ok: false, reason: "empty-title" };
  step.title = trimmed;
  return OK;
}

/**
 * Deletes a step.
 *
 * @param bucket - Bucket to change.
 * @param itemId - The item.
 * @param stepId - The step.
 * @param ctx - Who and when.
 * @returns Success, or a refusal.
 */
export function removeStep(
  bucket: Bucket,
  itemId: string,
  stepId: string,
  ctx: CommandContext,
): CommandResult<undefined> {
  const found = editableItem(bucket, itemId, ctx);
  if (!found.ok) return found;
  if (!found.value.steps.some((s) => s.id === stepId)) return { ok: false, reason: "unknown-step" };
  removeById(found.value.steps, stepId);
  return OK;
}

/**
 * Puts an item's steps in a new order.
 *
 * @param bucket - Bucket to change.
 * @param itemId - The item.
 * @param stepIds - Every step id exactly once, in the new order.
 * @param ctx - Who and when.
 * @returns Success, or a refusal.
 */
export function reorderSteps(
  bucket: Bucket,
  itemId: string,
  stepIds: readonly string[],
  ctx: CommandContext,
): CommandResult<undefined> {
  const found = editableItem(bucket, itemId, ctx);
  if (!found.ok) return found;
  const steps = found.value.steps;
  const byId = new Map(steps.map((s) => [s.id, s]));
  if (stepIds.length !== steps.length || new Set(stepIds).size !== stepIds.length)
    return { ok: false, reason: "invalid-order" };
  const ordered = stepIds.map((id) => byId.get(id));
  if (ordered.some((s) => s === undefined)) return { ok: false, reason: "invalid-order" };
  found.value.steps = ordered.flatMap((s) => (s ? [{ ...s }] : []));
  return OK;
}

/**
 * Turns an item into a step of another item (the Tab key in the list). Only a plain item
 * converts: one with its own steps, links, images, a nested bucket or any draw history would lose them.
 *
 * @param bucket - Bucket to change.
 * @param itemId - The item that becomes a step.
 * @param parentId - The item that receives the step, at the end of its steps.
 * @param ctx - Who and when.
 * @returns The new step's id, or a refusal.
 */
export function convertItemToStep(
  bucket: Bucket,
  itemId: string,
  parentId: string,
  ctx: CommandContext,
): CommandResult<string> {
  const found = editableItem(bucket, itemId, ctx);
  if (!found.ok) return found;
  const parent = editableItem(bucket, parentId, ctx);
  if (!parent.ok) return parent;
  if (itemId === parentId) return { ok: false, reason: "invalid-order" };
  const item = found.value;
  if (item.childBucketId !== undefined) return { ok: false, reason: "item-has-child-bucket" };
  if (item.steps.length > 0 || item.links.length > 0 || item.attachments.length > 0)
    return { ok: false, reason: "item-has-content" };
  // Its draw history would be left pointing at nothing.
  if (bucket.events.some((e) => e.itemId === itemId) || bucket.baseline?.items[itemId])
    return { ok: false, reason: "item-has-content" };
  const step = { id: ctx.makeId(), title: item.title, done: false };
  parent.value.steps.push(step);
  Reflect.deleteProperty(bucket.items, itemId);
  removeId(bucket.itemOrder, itemId);
  return { ok: true, value: step.id };
}

/**
 * Turns a step into an item of its own (Shift-Tab), placed right after the item it came from.
 *
 * @param bucket - Bucket to change.
 * @param itemId - The item that holds the step.
 * @param stepId - The step.
 * @param ctx - Who and when.
 * @returns The new item's id, or a refusal.
 */
export function convertStepToItem(
  bucket: Bucket,
  itemId: string,
  stepId: string,
  ctx: CommandContext,
): CommandResult<string> {
  const found = editableItem(bucket, itemId, ctx);
  if (!found.ok) return found;
  const step = found.value.steps.find((s) => s.id === stepId);
  if (!step) return { ok: false, reason: "unknown-step" };
  const id = ctx.makeId();
  bucket.items[id] = {
    id,
    title: step.title,
    tags: [],
    weight: 1,
    steps: [],
    links: [],
    attachments: [],
    archived: false,
    createdBy: ctx.memberId,
    createdAt: ctx.now.toISOString(),
  };
  const at = bucket.itemOrder.indexOf(itemId);
  bucket.itemOrder.splice(at + 1, 0, id);
  removeById(found.value.steps, stepId);
  return { ok: true, value: id };
}

/**
 * Attaches a link to an item.
 *
 * @param bucket - Bucket to change.
 * @param itemId - The item.
 * @param url - An `http`, `https` or `mailto` address.
 * @param ctx - Who and when.
 * @param title - Optional label; blank is ignored.
 * @returns The new link's id, or a refusal (`invalid-url` for anything else).
 */
export function addLink(
  bucket: Bucket,
  itemId: string,
  url: string,
  ctx: CommandContext,
  title?: string,
): CommandResult<string> {
  const found = editableItem(bucket, itemId, ctx);
  if (!found.ok) return found;
  const href = normalizeLinkUrl(url);
  if (href === undefined) return { ok: false, reason: "invalid-url" };
  const link: Link = { id: ctx.makeId(), url: href };
  if (title !== undefined && title.trim() !== "") link.title = title.trim();
  found.value.links.push(link);
  return { ok: true, value: link.id };
}

/**
 * Sets or clears a link's label.
 *
 * @param bucket - Bucket to change.
 * @param itemId - The item.
 * @param linkId - The link.
 * @param title - New label; blank removes it.
 * @param ctx - Who and when.
 * @returns Success, or a refusal.
 */
export function setLinkTitle(
  bucket: Bucket,
  itemId: string,
  linkId: string,
  title: string,
  ctx: CommandContext,
): CommandResult<undefined> {
  const found = editableItem(bucket, itemId, ctx);
  if (!found.ok) return found;
  const link = found.value.links.find((l) => l.id === linkId);
  if (!link) return { ok: false, reason: "unknown-link" };
  if (title.trim() === "") delete link.title;
  else link.title = title.trim();
  return OK;
}

/**
 * Removes a link.
 *
 * @param bucket - Bucket to change.
 * @param itemId - The item.
 * @param linkId - The link.
 * @param ctx - Who and when.
 * @returns Success, or a refusal.
 */
export function removeLink(
  bucket: Bucket,
  itemId: string,
  linkId: string,
  ctx: CommandContext,
): CommandResult<undefined> {
  const found = editableItem(bucket, itemId, ctx);
  if (!found.ok) return found;
  if (!found.value.links.some((l) => l.id === linkId)) return { ok: false, reason: "unknown-link" };
  removeById(found.value.links, linkId);
  return OK;
}

/** Input for {@link addAttachment}: an image already stored in the blob store. */
export type NewAttachment = Omit<Attachment, "id">;

/**
 * Attaches an image to an item.
 *
 * @param bucket - Bucket to change.
 * @param itemId - The item.
 * @param input - Blob id, type and size of the stored image; sizes must be positive integers.
 * @param ctx - Who and when.
 * @returns The new attachment's id, or a refusal.
 */
export function addAttachment(
  bucket: Bucket,
  itemId: string,
  input: NewAttachment,
  ctx: CommandContext,
): CommandResult<string> {
  const found = editableItem(bucket, itemId, ctx);
  if (!found.ok) return found;
  const positive = (n: number): boolean => Number.isInteger(n) && n > 0;
  if (
    input.blobId === "" ||
    !positive(input.width) ||
    !positive(input.height) ||
    !positive(input.bytes)
  )
    return { ok: false, reason: "invalid-attachment" };
  const attachment: Attachment = {
    id: ctx.makeId(),
    blobId: input.blobId,
    mime: input.mime,
    width: input.width,
    height: input.height,
    bytes: input.bytes,
  };
  if (input.alt !== undefined && input.alt.trim() !== "") attachment.alt = input.alt.trim();
  found.value.attachments.push(attachment);
  return { ok: true, value: attachment.id };
}

/**
 * Sets or clears an image's description for screen readers.
 *
 * @param bucket - Bucket to change.
 * @param itemId - The item.
 * @param attachmentId - The attachment.
 * @param alt - New description; blank removes it.
 * @param ctx - Who and when.
 * @returns Success, or a refusal.
 */
export function setAttachmentAlt(
  bucket: Bucket,
  itemId: string,
  attachmentId: string,
  alt: string,
  ctx: CommandContext,
): CommandResult<undefined> {
  const found = editableItem(bucket, itemId, ctx);
  if (!found.ok) return found;
  const attachment = found.value.attachments.find((a) => a.id === attachmentId);
  if (!attachment) return { ok: false, reason: "unknown-attachment" };
  if (alt.trim() === "") delete attachment.alt;
  else attachment.alt = alt.trim();
  return OK;
}

/**
 * Removes an image from an item. The bytes stay in the blob store until garbage collection
 * finds nothing refers to them (plan.md §5).
 *
 * @param bucket - Bucket to change.
 * @param itemId - The item.
 * @param attachmentId - The attachment.
 * @param ctx - Who and when.
 * @returns Success, or a refusal.
 */
export function removeAttachment(
  bucket: Bucket,
  itemId: string,
  attachmentId: string,
  ctx: CommandContext,
): CommandResult<undefined> {
  const found = editableItem(bucket, itemId, ctx);
  if (!found.ok) return found;
  if (!found.value.attachments.some((a) => a.id === attachmentId))
    return { ok: false, reason: "unknown-attachment" };
  removeById(found.value.attachments, attachmentId);
  return OK;
}

/**
 * Renames a bucket.
 *
 * @param bucket - Bucket to change.
 * @param name - New name; must not be blank.
 * @param ctx - Who and when.
 * @returns Success, or a refusal.
 */
export function renameBucket(
  bucket: Bucket,
  name: string,
  ctx: CommandContext,
): CommandResult<undefined> {
  if (!canEdit(bucket.members[ctx.memberId]?.role)) return { ok: false, reason: "not-permitted" };
  const trimmed = name.trim();
  if (trimmed === "") return { ok: false, reason: "empty-title" };
  bucket.name = trimmed;
  return OK;
}

/**
 * Changes a bucket's icon.
 *
 * @param bucket - Bucket to change.
 * @param icon - Icon name; must not be blank.
 * @param ctx - Who and when.
 * @returns Success, or a refusal.
 */
export function setBucketIcon(
  bucket: Bucket,
  icon: string,
  ctx: CommandContext,
): CommandResult<undefined> {
  if (!canEdit(bucket.members[ctx.memberId]?.role)) return { ok: false, reason: "not-permitted" };
  if (icon.trim() === "") return { ok: false, reason: "empty-title" };
  bucket.icon = icon.trim();
  return OK;
}

/**
 * Changes a bucket's color.
 *
 * @param bucket - Bucket to change.
 * @param color - One of `BUCKET_COLORS`.
 * @param ctx - Who and when.
 * @returns Success, or a refusal (`invalid-color` for any other name).
 */
export function setBucketColor(
  bucket: Bucket,
  color: string,
  ctx: CommandContext,
): CommandResult<undefined> {
  if (!canEdit(bucket.members[ctx.memberId]?.role)) return { ok: false, reason: "not-permitted" };
  if (!isBucketColor(color)) return { ok: false, reason: "invalid-color" };
  bucket.color = color;
  return OK;
}

/**
 * Removes a bucket's pointer from the library (its document is dealt with by the app).
 *
 * @param library - Library to change.
 * @param bucketId - The bucket.
 * @returns The removed pointer, or a refusal when the library has no such bucket.
 */
export function removeBucketRef(library: Library, bucketId: string): CommandResult<BucketRef> {
  const ref = library.buckets[bucketId];
  if (!ref) return { ok: false, reason: "unknown-bucket" };
  Reflect.deleteProperty(library.buckets, bucketId);
  removeId(library.bucketOrder, bucketId);
  Reflect.deleteProperty(library.reminders, bucketId);
  return { ok: true, value: ref };
}

/**
 * Puts the library's buckets in a new order.
 *
 * @param library - Library to change.
 * @param bucketIds - Every bucket id exactly once, in the new order.
 * @returns Success, or `invalid-order`.
 */
export function reorderBuckets(
  library: Library,
  bucketIds: readonly string[],
): CommandResult<undefined> {
  const unique = new Set(bucketIds);
  if (
    bucketIds.length !== library.bucketOrder.length ||
    unique.size !== bucketIds.length ||
    !library.bucketOrder.every((id) => unique.has(id))
  )
    return { ok: false, reason: "invalid-order" };
  library.bucketOrder = [...bucketIds];
  return OK;
}

// SPDX-License-Identifier: Apache-2.0

import { BUCKET_SCHEMA_VERSION, LIBRARY_SCHEMA_VERSION } from "../migrations";
import { minutesOfDay } from "../reminders/rrule";
import { PRESETS, matchPreset, rulesEqual } from "./presets";
import type {
  Bucket,
  BucketPresetId,
  BucketRef,
  BucketRules,
  DrawEvent,
  Item,
  Library,
  MemberRole,
  Step,
} from "./types";

/**
 * Commands change a bucket in place, so they can run inside an Automerge `change()`
 * (AGENTS.md §8). They do no I/O and read no globals: time and ids come from
 * {@link CommandContext}. Callers must never edit a bucket any other way.
 */

/** Everything a command needs from the outside world. */
export interface CommandContext {
  /** Member performing the command. */
  memberId: string;
  /** Current time; injected so results are reproducible. */
  now: Date;
  /** Produces a fresh unique id (the app passes a wrapper around `crypto.randomUUID`). */
  makeId: () => string;
}

/** Why a command was refused. */
export type CommandRefusal =
  | "not-permitted"
  | "empty-title"
  | "unknown-item"
  | "unknown-step"
  | "invalid-weight"
  | "invalid-rules"
  | "invalid-time-zone"
  | "invalid-order";

/** Outcome of a command: a value, or a typed refusal the UI can explain. */
export type CommandResult<T> = { ok: true; value: T } | { ok: false; reason: CommandRefusal };

/**
 * Whether a role may add and change items and rules.
 *
 * @param role - The member's role.
 * @returns `true` for owners and editors.
 */
export function canEdit(role: MemberRole | undefined): boolean {
  return role === "owner" || role === "editor";
}

/**
 * Whether a role may draw items and finish them.
 *
 * @param role - The member's role.
 * @returns `true` for owners, editors and drawers.
 */
export function canDraw(role: MemberRole | undefined): boolean {
  return role === "owner" || role === "editor" || role === "drawer";
}

/** Input for {@link createBucket}. */
export interface NewBucket {
  /** Shown to the user. */
  name: string;
  /** Starting rules; defaults to `"grab-and-go"`. */
  preset?: Exclude<BucketPresetId, "custom">;
  /** Icon name; defaults to `"bucket"`. */
  icon?: string;
  /** Design-token name; defaults to `"accent"`. */
  color?: string;
  /** Display name of the creator, who becomes the owner. */
  ownerName: string;
  /** IANA zone for time-of-day rules; the app passes the creator's zone. UTC when omitted. */
  timeZone?: string;
}

/**
 * Creates a bucket whose only member, the owner, is the creator.
 *
 * @param input - Name, preset and owner.
 * @param ctx - Member id of the creator, time and id source.
 * @returns A new bucket with no items.
 */
export function createBucket(input: NewBucket, ctx: CommandContext): Bucket {
  const preset = input.preset ?? "grab-and-go";
  const now = ctx.now.toISOString();
  return {
    id: ctx.makeId(),
    schemaVersion: BUCKET_SCHEMA_VERSION,
    name: input.name,
    icon: input.icon ?? "bucket",
    color: input.color ?? "accent",
    preset,
    rules: { ...PRESETS[preset].rules },
    members: {
      [ctx.memberId]: {
        memberId: ctx.memberId,
        displayName: input.ownerName,
        role: "owner",
        devicePublicKeys: [],
        joinedAt: now,
      },
    },
    sharing: { historyVisibility: "full", tossBackReasons: "shared" },
    ...(input.timeZone === undefined ? {} : { timeZone: input.timeZone }),
    items: {},
    itemOrder: [],
    events: [],
    createdAt: now,
  };
}

/** Input for {@link addItem}. */
export interface NewItem {
  /** Shown to the user; must not be blank. */
  title: string;
  /** Free-form notes. */
  notes?: string;
  /** Labels. */
  tags?: string[];
  /** Relative chance under weighted selection; default 1. */
  weight?: number;
}

function validWeight(weight: number): boolean {
  return Number.isFinite(weight) && weight >= 0;
}

/**
 * Adds an item at the end of the bucket.
 *
 * @param bucket - Bucket to change.
 * @param input - The new item.
 * @param ctx - Who and when.
 * @returns The new item's id, or a refusal.
 */
export function addItem(
  bucket: Bucket,
  input: NewItem,
  ctx: CommandContext,
): CommandResult<string> {
  if (!canEdit(bucket.members[ctx.memberId]?.role)) return { ok: false, reason: "not-permitted" };
  const title = input.title.trim();
  if (title === "") return { ok: false, reason: "empty-title" };
  const weight = input.weight ?? 1;
  if (!validWeight(weight)) return { ok: false, reason: "invalid-weight" };
  const item: Item = {
    id: ctx.makeId(),
    title,
    tags: input.tags ? [...input.tags] : [],
    weight,
    steps: [],
    links: [],
    attachments: [],
    archived: false,
    createdBy: ctx.memberId,
    createdAt: ctx.now.toISOString(),
  };
  if (input.notes !== undefined) item.notes = input.notes;
  bucket.items[item.id] = item;
  bucket.itemOrder.push(item.id);
  return { ok: true, value: item.id };
}

function editableItem(bucket: Bucket, itemId: string, ctx: CommandContext): CommandResult<Item> {
  if (!canEdit(bucket.members[ctx.memberId]?.role)) return { ok: false, reason: "not-permitted" };
  const item = bucket.items[itemId];
  return item ? { ok: true, value: item } : { ok: false, reason: "unknown-item" };
}

/**
 * Hides an item from draws and lists, or brings it back. History is kept either way.
 *
 * @param bucket - Bucket to change.
 * @param itemId - The item.
 * @param archived - New state.
 * @param ctx - Who and when.
 * @returns Success, or a refusal.
 */
export function setItemArchived(
  bucket: Bucket,
  itemId: string,
  archived: boolean,
  ctx: CommandContext,
): CommandResult<undefined> {
  const found = editableItem(bucket, itemId, ctx);
  if (!found.ok) return found;
  found.value.archived = archived;
  return { ok: true, value: undefined };
}

/**
 * Sets how likely an item is to come up under weighted selection.
 *
 * @param bucket - Bucket to change.
 * @param itemId - The item.
 * @param weight - Finite and not negative; 0 means never drawn.
 * @param ctx - Who and when.
 * @returns Success, or a refusal.
 */
export function setItemWeight(
  bucket: Bucket,
  itemId: string,
  weight: number,
  ctx: CommandContext,
): CommandResult<undefined> {
  const found = editableItem(bucket, itemId, ctx);
  if (!found.ok) return found;
  if (!validWeight(weight)) return { ok: false, reason: "invalid-weight" };
  found.value.weight = weight;
  return { ok: true, value: undefined };
}

/**
 * Adds a step to an item.
 *
 * @param bucket - Bucket to change.
 * @param itemId - The item.
 * @param title - Shown to the user; must not be blank.
 * @param ctx - Who and when.
 * @returns The new step's id, or a refusal.
 */
export function addStep(
  bucket: Bucket,
  itemId: string,
  title: string,
  ctx: CommandContext,
): CommandResult<string> {
  const found = editableItem(bucket, itemId, ctx);
  if (!found.ok) return found;
  const trimmed = title.trim();
  if (trimmed === "") return { ok: false, reason: "empty-title" };
  const step: Step = { id: ctx.makeId(), title: trimmed, done: false };
  found.value.steps.push(step);
  return { ok: true, value: step.id };
}

/**
 * Ticks a step off, or unticks it. Anyone who may draw can do this, so a drawer can work
 * through the steps of the item they hold.
 *
 * @param bucket - Bucket to change.
 * @param itemId - The item.
 * @param stepId - The step.
 * @param done - New state.
 * @param ctx - Who and when.
 * @returns Success, or a refusal.
 */
export function setStepDone(
  bucket: Bucket,
  itemId: string,
  stepId: string,
  done: boolean,
  ctx: CommandContext,
): CommandResult<undefined> {
  if (!canDraw(bucket.members[ctx.memberId]?.role)) return { ok: false, reason: "not-permitted" };
  const item = bucket.items[itemId];
  if (!item) return { ok: false, reason: "unknown-item" };
  const step = item.steps.find((s) => s.id === stepId);
  if (!step) return { ok: false, reason: "unknown-step" };
  step.done = done;
  if (done) {
    step.doneBy = ctx.memberId;
    step.doneAt = ctx.now.toISOString();
  } else {
    delete step.doneBy;
    delete step.doneAt;
  }
  return { ok: true, value: undefined };
}

/**
 * Reorders the items.
 *
 * @param bucket - Bucket to change.
 * @param itemIds - Every item id exactly once, in the new order.
 * @param ctx - Who and when.
 * @returns Success, or a refusal.
 */
export function reorderItems(
  bucket: Bucket,
  itemIds: readonly string[],
  ctx: CommandContext,
): CommandResult<undefined> {
  if (!canEdit(bucket.members[ctx.memberId]?.role)) return { ok: false, reason: "not-permitted" };
  const unique = new Set(itemIds);
  const isPermutation =
    itemIds.length === bucket.itemOrder.length &&
    unique.size === itemIds.length &&
    bucket.itemOrder.every((id) => unique.has(id));
  if (!isPermutation) return { ok: false, reason: "invalid-order" };
  bucket.itemOrder = [...itemIds];
  return { ok: true, value: undefined };
}

function validRules(rules: BucketRules): boolean {
  const positiveInt = (n: number): boolean => Number.isInteger(n) && n >= 1;
  return (
    positiveInt(rules.drawCount) &&
    positiveInt(rules.maxInHand) &&
    (rules.agingRatePerDay === undefined ||
      (Number.isFinite(rules.agingRatePerDay) && rules.agingRatePerDay >= 0)) &&
    (rules.autoReturnAt === undefined || /^([01]\d|2[0-3]):[0-5]\d$/.test(rules.autoReturnAt))
  );
}

/**
 * Replaces the bucket's rules and re-labels its preset.
 *
 * The preset becomes `"custom"` as soon as the rules stop matching one. A `"nested"` bucket
 * keeps that label while its rules stay at the base values, because nesting lives in the items.
 *
 * @param bucket - Bucket to change.
 * @param rules - The complete new rules.
 * @param ctx - Who and when.
 * @returns Success, or a refusal.
 */
export function setRules(
  bucket: Bucket,
  rules: BucketRules,
  ctx: CommandContext,
): CommandResult<undefined> {
  if (!canEdit(bucket.members[ctx.memberId]?.role)) return { ok: false, reason: "not-permitted" };
  if (!validRules(rules)) return { ok: false, reason: "invalid-rules" };
  bucket.rules = { ...rules };
  const keepsNested = bucket.preset === "nested" && rulesEqual(rules, PRESETS.nested.rules);
  bucket.preset = keepsNested ? "nested" : matchPreset(rules);
  return { ok: true, value: undefined };
}

/**
 * Appends events to the bucket's history, as returned by `draw` or `resolve`.
 *
 * An item that returns to the bucket after being finished starts its steps afresh when the
 * rule `resetStepsOnReturn` is on. Steps are stored state, so this change travels with the
 * event inside one `change()`.
 *
 * @param bucket - Bucket to change.
 * @param events - Events to append, in order.
 */
export function applyEvents(bucket: Bucket, events: readonly DrawEvent[]): void {
  bucket.events.push(...events);
  if (!bucket.rules.resetStepsOnReturn) return;
  for (const event of events) {
    if (event.kind !== "done" || event.onDone === "remove") continue;
    for (const step of bucket.items[event.itemId]?.steps ?? []) {
      step.done = false;
      delete step.doneBy;
      delete step.doneAt;
    }
  }
}

/**
 * Creates an empty personal library.
 *
 * @param displayName - Name shown to other members.
 * @param ctx - Time and id source.
 * @returns A new library with no buckets.
 */
export function createLibrary(displayName: string, ctx: Pick<CommandContext, "makeId">): Library {
  return {
    id: ctx.makeId(),
    schemaVersion: LIBRARY_SCHEMA_VERSION,
    buckets: {},
    bucketOrder: [],
    reminders: {},
    settings: { appearance: "system" },
    profile: { displayName },
  };
}

/**
 * Adds a pointer to a bucket at the end of the library, or updates the pointer if the bucket is
 * already there.
 *
 * @param library - Library to change.
 * @param ref - Pointer to the bucket.
 */
export function addBucketRef(library: Library, ref: BucketRef): void {
  if (!library.bucketOrder.includes(ref.bucketId)) library.bucketOrder.push(ref.bucketId);
  library.buckets[ref.bucketId] = { ...ref };
}

/**
 * Sets the time zone that time-of-day rules (such as Daily Draw's return time) use.
 *
 * @param bucket - Bucket to change.
 * @param timeZone - IANA zone, for example `"America/New_York"`.
 * @param ctx - Who and when.
 * @returns Success, or a refusal.
 */
export function setTimeZone(
  bucket: Bucket,
  timeZone: string,
  ctx: CommandContext,
): CommandResult<undefined> {
  if (!canEdit(bucket.members[ctx.memberId]?.role)) return { ok: false, reason: "not-permitted" };
  if (minutesOfDay(timeZone, ctx.now) === undefined)
    return { ok: false, reason: "invalid-time-zone" };
  bucket.timeZone = timeZone;
  return { ok: true, value: undefined };
}

// SPDX-License-Identifier: Apache-2.0

import type { Duration } from "../duration";
import type { BucketReminder } from "../reminders/next-fire-times";

/**
 * Data model types, plan.md §5. These describe plain JSON-compatible documents so they can
 * live inside Automerge; they are mutable on purpose, because commands run inside `change()`
 * (AGENTS.md §8). Dates are ISO 8601 strings.
 */

/** What a member may do in a bucket (plan.md §10). */
export type MemberRole = "owner" | "editor" | "drawer" | "viewer";

/** Identifies a named set of starting rules, or `"custom"` once the rules no longer match one. */
export type BucketPresetId =
  | "grab-and-go"
  | "rotation-pool"
  | "weighted"
  | "simmer"
  | "mystery-bag"
  | "daily-draw"
  | "round-robin"
  | "nested"
  | "custom";

/** How the next item is chosen (plan.md §6.2 step 5–6). */
export type SelectionStrategy = "uniform" | "weighted" | "aging" | "round-robin";

/** How hard it is to toss an item back (UI only). */
export type TossBackConfirm = "none" | "simple" | "deliberate";

/** The rules a bucket draws by (plan.md §6.1). */
export interface BucketRules {
  /** Items pulled per draw. */
  drawCount: number;
  /** Most unresolved items allowed at once, within {@link BucketRules.inHandScope}. */
  maxInHand: number;
  /** Whether the limit applies to the whole bucket or to each member. */
  inHandScope: "bucket" | "per-member";
  /** Refuse draws while anything is in hand. */
  lockUntilResolved: boolean;
  /** What finishing an item does: take it out for good, or return it to the bucket. */
  onDone: "remove" | "return";
  /** Finishing needs every step done. */
  requireAllSteps: boolean;
  /** Clear step progress when an item returns to the bucket. */
  resetStepsOnReturn: boolean;
  /** Local time of day (`"HH:MM"`) when unresolved items return on their own. */
  autoReturnAt?: string;
  /** Whether every item gets a turn before any repeats. */
  noRepeat: "off" | "until-cycle-complete";
  /** Rest time after an item returns. */
  cooldown?: Duration;
  /** Finished items rejoin the pool after this long. */
  cycleResetAfter?: Duration;
  /** Prefer items still waiting for a turn this cycle. */
  favorUndrawn: boolean;
  /** Whether tossing back uses up the item's turn. */
  tossBackCountsAsDrawn: boolean;
  /** How the next item is chosen. */
  selection: SelectionStrategy;
  /** Extra weight per day waiting (aging only). */
  agingRatePerDay?: number;
  /** Mystery Bag: show titles only once drawn. */
  hideTitlesUntilDrawn: boolean;
  /** How hard it is to toss an item back. */
  tossBackConfirm: TossBackConfirm;
}

/** One step of an item. */
export interface Step {
  /** Unique within the item. */
  id: string;
  /** Shown to the user. */
  title: string;
  /** Whether the step is finished. */
  done: boolean;
  /** Member who finished it. */
  doneBy?: string;
  /** When it was finished. */
  doneAt?: string;
}

/** A link attached to an item. */
export interface Link {
  /** Unique within the item. */
  id: string;
  /** Target address. */
  url: string;
  /** Optional label. */
  title?: string;
}

/** An image attached to an item; the bytes live in the blob store (plan.md §5). */
export interface Attachment {
  /** Unique within the item. */
  id: string;
  /** Key into the blob store. */
  blobId: string;
  /** Image type. */
  mime: "image/jpeg" | "image/png" | "image/webp" | "image/gif" | "image/heic";
  /** Pixel width. */
  width: number;
  /** Pixel height. */
  height: number;
  /** Size in bytes. */
  bytes: number;
  /** Accessible description. */
  alt?: string;
}

/** Something that can be drawn from a bucket. Its status is derived from events, never stored. */
export interface Item {
  /** Unique within the bucket. */
  id: string;
  /** Shown to the user. */
  title: string;
  /** Free-form notes. */
  notes?: string;
  /** Labels. */
  tags: string[];
  /** Relative chance under weighted selection; default 1. */
  weight: number;
  /** Ordered steps. */
  steps: Step[];
  /** Attached links. */
  links: Link[];
  /** Attached images. */
  attachments: Attachment[];
  /** Another bucket to draw from when this item is drawn (nested buckets). */
  childBucketId?: string;
  /** Hidden from draws and lists but kept for history. */
  archived: boolean;
  /** Member who added it. */
  createdBy: string;
  /** When it was added. */
  createdAt: string;
}

/** An entry in a bucket's append-only history (plan.md §5). */
export interface DrawEvent {
  /** Unique within the bucket. */
  id: string;
  /** The item concerned; unused by `cycle-reset`, which affects every item. */
  itemId: string;
  /** What happened. */
  kind: "drawn" | "done" | "tossed-back" | "cycle-reset";
  /** When it happened. */
  at: string;
  /** Member who did it. */
  memberId: string;
  /** Device it happened on. */
  deviceId: string;
  /** Toss-back reason, when shared. */
  note?: string;
  /** Toss-back reason encrypted for the author's devices only. */
  privateNote?: string;
  /** Snapshot of the rule in force when the item was finished, so later edits don't rewrite history. */
  onDone?: BucketRules["onDone"];
  /** Snapshot of the cooldown in force when the item was finished. */
  cooldown?: Duration;
  /** Snapshot of `tossBackCountsAsDrawn` in force when the item was tossed back. */
  countsAsDrawn?: boolean;
}

/** A person with access to a bucket. */
export interface Member {
  /** Stable member id. */
  memberId: string;
  /** Shown to other members. */
  displayName: string;
  /** What they may do. */
  role: MemberRole;
  /** Public keys of their devices. */
  devicePublicKeys: string[];
  /** When they joined. */
  joinedAt: string;
}

/** Privacy options for shared buckets (plan.md §10.5). */
export interface SharingSettings {
  /** Whether members see every event or only current status. */
  historyVisibility: "full" | "status-only";
  /** Whether toss-back reasons are visible to other members. */
  tossBackReasons: "shared" | "private";
}

/** Where one item stood when old history was compacted away (see `compactHistory`). */
export interface ItemBaseline {
  /** In the bucket, in someone's hand, or finished for good. */
  status: "in" | "hand" | "done";
  /** Member holding it, while in hand. */
  heldBy: string | null;
  /** When it was drawn, while in hand. */
  heldSince: string | null;
  /** Last time it was drawn. */
  lastDrawnAt: string | null;
  /** Last time it was finished. */
  lastDoneAt: string | null;
  /** How many times it has been drawn. */
  timesDrawn: number;
  /** How many times it has been finished. */
  timesDone: number;
  /** When its rest ends, if it was returned with a cooldown. */
  cooldownUntil: string | null;
  /** Whether it has had its turn in the current cycle. */
  drawnThisCycle: boolean;
  /** Turn flag before the latest draw, so a later toss-back can still undo it. */
  prevDrawnThisCycle: boolean;
}

/** Summary of events older than `through`, which were removed from the history. */
export interface BucketBaseline {
  /** Events strictly before this instant are folded in. */
  through: string;
  /** Per-item state at that instant. */
  items: Record<string, ItemBaseline>;
}

/** A bucket: one shareable document. */
export interface Bucket {
  /** Unique id. */
  id: string;
  /** Format version; see the migrations module. */
  schemaVersion: number;
  /** Shown to the user. */
  name: string;
  /** Icon name. */
  icon: string;
  /** Design-token name, never a raw color. */
  color: string;
  /** Preset the rules started from, or `"custom"`. */
  preset: BucketPresetId;
  /** Rules in force. */
  rules: BucketRules;
  /** Members by member id. */
  members: Record<string, Member>;
  /** Privacy options. */
  sharing: SharingSettings;
  /** Items by id. */
  items: Record<string, Item>;
  /** Display order of item ids. */
  itemOrder: string[];
  /** Append-only history, minus anything folded into {@link Bucket.baseline}. */
  events: DrawEvent[];
  /** State at the point old history was compacted away; absent until the first compaction. */
  baseline?: BucketBaseline;
  /** When the bucket was created. */
  createdAt: string;
}

/** Pointer from the library to a bucket document. */
export interface BucketRef {
  /** The bucket's id. */
  bucketId: string;
  /** Id of the key that encrypts it. */
  keyId: string;
  /** This user's role in it. */
  role: MemberRole;
  /** When it was added to the library. */
  addedAt: string;
}

/** Personal settings that follow the user across devices. Grows with later milestones. */
export interface LibrarySettings {
  /** Colour scheme preference. */
  appearance: "system" | "light" | "dark";
}

/** The user's personal document (plan.md §5). */
export interface Library {
  /** Unique id. */
  id: string;
  /** Format version; see the migrations module. */
  schemaVersion: number;
  /** Bucket pointers by bucket id. */
  buckets: Record<string, BucketRef>;
  /** Display order of bucket ids. */
  bucketOrder: string[];
  /** Reminders by bucket id; personal, never shared (plan.md §7). */
  reminders: Record<string, BucketReminder[]>;
  /** Personal settings. */
  settings: LibrarySettings;
  /** Name and avatar shown to others. */
  profile: { displayName: string; avatar?: string };
}

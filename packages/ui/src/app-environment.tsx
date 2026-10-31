// SPDX-License-Identifier: Apache-2.0

import {
  applyEvents,
  createBucket,
  draw,
  resolve,
  type Bucket,
  type CommandContext,
  type CommandResult,
  type DrawResult,
  type NewBucket,
  type ResolveResult,
  type Rng,
} from "@buckets/core";
import type { SettingsStore } from "@buckets/storage";
import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useSyncExternalStore,
  type ReactElement,
  type ReactNode,
} from "react";
import { useLibrary, useLibraryStore } from "./library/library-provider";

/**
 * What the app knows about the person and the moment. Time, randomness and ids come in from
 * here so the UI stays testable and `@buckets/core` stays pure (AGENTS.md §1).
 */
export interface AppEnvironment {
  /** Member id of the person using this device. */
  memberId: string;
  /** Id of this device. */
  deviceId: string;
  /** Name shown to other members. */
  displayName: string;
  /** IANA zone of this device, used for new buckets' time-of-day rules. */
  timeZone: string;
  /** Current time. */
  now: () => Date;
  /** Random source for draws. */
  rng: Rng;
  /** Makes fresh unique ids. */
  makeId: () => string;
  /** Where per-device preferences such as pane sizes are kept. */
  settings?: SettingsStore | undefined;
}

const EnvironmentContext = createContext<AppEnvironment | undefined>(undefined);

/** Props for {@link EnvironmentProvider}. */
export interface EnvironmentProviderProps {
  /** The environment. Keep it stable between renders. */
  environment: AppEnvironment;
  /** What to render. */
  children: ReactNode;
}

/**
 * Supplies the {@link AppEnvironment} to everything below.
 *
 * @param props - See {@link EnvironmentProviderProps}.
 * @returns The provider.
 */
export function EnvironmentProvider({
  environment,
  children,
}: EnvironmentProviderProps): ReactElement {
  return <EnvironmentContext value={environment}>{children}</EnvironmentContext>;
}

/**
 * Reads the environment.
 *
 * @returns The environment.
 * @throws When used outside an {@link EnvironmentProvider}; that is a programmer error.
 */
export function useEnvironment(): AppEnvironment {
  const environment = useContext(EnvironmentContext);
  if (environment === undefined)
    throw new Error("useEnvironment needs an EnvironmentProvider above it");
  return environment;
}

/** A clock that components can subscribe to. */
function createClock(
  environment: AppEnvironment,
  intervalMs: number,
): {
  refresh: () => void;
  subscribe: (listener: () => void) => () => void;
  getSnapshot: () => Date;
} {
  let current = environment.now();
  const listeners = new Set<() => void>();
  const refresh = (): void => {
    current = environment.now();
    for (const listener of listeners) listener();
  };
  return {
    refresh,
    subscribe(listener) {
      listeners.add(listener);
      const id = setInterval(refresh, intervalMs);
      return () => {
        listeners.delete(listener);
        clearInterval(id);
      };
    },
    getSnapshot: () => current,
  };
}

/**
 * The current time, refreshed on a timer and whenever the library changes, so cooldowns and
 * automatic returns show up without a click.
 *
 * @param intervalMs - How often to refresh; default every 30 seconds.
 * @returns The time.
 */
export function useNow(intervalMs = 30_000): Date {
  const environment = useEnvironment();
  const library = useLibrary();
  const clock = useMemo(() => createClock(environment, intervalMs), [environment, intervalMs]);
  // A change to the library (a draw, say) is a reason to look at the clock again.
  useEffect(() => {
    clock.refresh();
  }, [clock, library]);
  return useSyncExternalStore(clock.subscribe, clock.getSnapshot);
}

/** Everything the UI can do to the user's documents. Each call is one Automerge change. */
export interface Actions {
  /**
   * Runs a core command on a bucket.
   *
   * @param bucketId - The bucket.
   * @param command - Receives the bucket and a ready command context.
   * @returns The command's result.
   */
  run<T>(
    bucketId: string,
    command: (bucket: Bucket, ctx: CommandContext) => CommandResult<T>,
  ): CommandResult<T>;
  /**
   * Makes a bucket and adds it to the library.
   *
   * @param input - Name, preset, icon and color.
   * @returns The new bucket's id.
   */
  createBucket(input: Omit<NewBucket, "ownerName">): string;
  /**
   * Draws from a bucket for the current member.
   *
   * @param bucketId - The bucket.
   * @returns The draw result; events are already recorded when it succeeded.
   */
  draw(bucketId: string): DrawResult;
  /**
   * Finishes an item or tosses it back.
   *
   * @param bucketId - The bucket.
   * @param itemId - The item.
   * @param kind - `"done"` or `"tossed-back"`.
   * @param note - Toss-back reason.
   * @returns The result; the event is already recorded when it succeeded.
   */
  resolveItem(
    bucketId: string,
    itemId: string,
    kind: "done" | "tossed-back",
    note?: string,
  ): ResolveResult;
}

/**
 * Gets the actions that change the user's documents.
 *
 * @returns The {@link Actions}.
 */
export function useActions(): Actions {
  const store = useLibraryStore();
  const environment = useEnvironment();
  return useMemo<Actions>(() => {
    const context = (): CommandContext => ({
      memberId: environment.memberId,
      now: environment.now(),
      makeId: environment.makeId,
    });
    const refused = { ok: false, reason: "not-permitted" } as const;
    return {
      run: (bucketId, command) =>
        store.updateBucket(bucketId, (bucket) => command(bucket, context())),
      createBucket(input) {
        const ctx = context();
        const bucket = createBucket(
          { ...input, ownerName: environment.displayName, timeZone: environment.timeZone },
          ctx,
        );
        store.addBucket(bucket, {
          bucketId: bucket.id,
          keyId: "local",
          role: "owner",
          addedAt: ctx.now.toISOString(),
        });
        return bucket.id;
      },
      draw(bucketId) {
        let outcome: DrawResult = refused;
        store.updateBucket(bucketId, (bucket) => {
          outcome = draw(bucket, {
            memberId: environment.memberId,
            deviceId: environment.deviceId,
            now: environment.now(),
            rng: environment.rng,
            makeId: environment.makeId,
          });
          if (outcome.ok) applyEvents(bucket, outcome.events);
          return { ok: true, value: undefined };
        });
        return outcome;
      },
      resolveItem(bucketId, itemId, kind, note) {
        let outcome: ResolveResult = refused;
        store.updateBucket(bucketId, (bucket) => {
          outcome = resolve(bucket, {
            itemId,
            kind,
            memberId: environment.memberId,
            deviceId: environment.deviceId,
            now: environment.now(),
            makeId: environment.makeId,
            ...(note === undefined || note.trim() === "" ? {} : { note: note.trim() }),
          });
          if (outcome.ok) applyEvents(bucket, [outcome.event]);
          return { ok: true, value: undefined };
        });
        return outcome;
      },
    };
  }, [store, environment]);
}

"use client";

import type { PostgrestError } from "@supabase/supabase-js";
import { supabase } from "@/lib/supabaseClient";

// Actions are plain, JSON-serializable descriptions of a Supabase call --
// not closures -- so the queue survives a full page reload (it lives in
// localStorage) and can still be replayed after the tab/app was closed
// while offline and reopened later.
export type QueuedAction =
  | { id: string; kind: "insert"; table: string; values: Record<string, unknown> }
  | { id: string; kind: "update"; table: string; match: Record<string, string>; values: Record<string, unknown> }
  | { id: string; kind: "delete"; table: string; match: Record<string, string> }
  | { id: string; kind: "rpc"; fn: string; args: Record<string, unknown> };

// Plain `Omit<QueuedAction, "id">` doesn't distribute over the union (it
// collapses to the common-keys-only shape), which would let a caller pass
// e.g. `{ kind: "rpc", table: "..." }` without a type error. Distributing
// manually keeps each branch's own fields intact.
type DistributiveOmit<T, K extends keyof T> = T extends unknown ? Omit<T, K> : never;
export type QueuedActionInput = DistributiveOmit<QueuedAction, "id">;

const STORAGE_KEY = "samama-home:sync-queue:v1";
const listeners = new Set<() => void>();

function notify() {
  for (const listener of listeners) listener();
}

/** Subscribe to any change in the queue (enqueue or successful flush). */
export function onQueueChange(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

function readQueue(): QueuedAction[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    return raw ? (JSON.parse(raw) as QueuedAction[]) : [];
  } catch {
    return [];
  }
}

function writeQueue(queue: QueuedAction[]) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(queue));
  } catch {
    // Storage full/unavailable -- the action already applied to local
    // state/UI, it just won't survive a reload before it syncs.
  }
  notify();
}

export function enqueue(action: QueuedActionInput) {
  const queue = readQueue();
  queue.push({ ...action, id: crypto.randomUUID() } as QueuedAction);
  writeQueue(queue);
}

export function pendingCount(): number {
  return readQueue().length;
}

/**
 * A fetch() rejection (TypeError, no HTTP response at all) means the
 * request never reached the network -- the offline case this queue
 * exists for. A real Supabase/Postgres error (bad request, RLS, a
 * removed row) comes back as a normal response and should surface to
 * the user instead of being queued forever.
 */
export function isNetworkError(error: unknown): boolean {
  if (typeof navigator !== "undefined" && !navigator.onLine) return true;
  if (error instanceof TypeError) return true;
  if (error && typeof error === "object" && "message" in error) {
    return String((error as { message?: unknown }).message).toLowerCase().includes("fetch");
  }
  return false;
}

async function runAction(action: QueuedAction): Promise<{ error: unknown }> {
  switch (action.kind) {
    case "insert": {
      const { error } = await supabase.from(action.table).insert(action.values);
      return { error };
    }
    case "update": {
      let query = supabase.from(action.table).update(action.values);
      for (const [column, value] of Object.entries(action.match)) query = query.eq(column, value);
      const { error } = await query;
      return { error };
    }
    case "delete": {
      let query = supabase.from(action.table).delete();
      for (const [column, value] of Object.entries(action.match)) query = query.eq(column, value);
      const { error } = await query;
      return { error };
    }
    case "rpc": {
      const { error } = await supabase.rpc(action.fn, action.args);
      return { error };
    }
  }
}

/**
 * Runs a mutation; if it fails purely because there's no network, the
 * change is queued for later replay instead of surfacing an error (the
 * caller is expected to have already applied the change to local/
 * optimistic state, so the UI already reflects it either way). A real
 * server-side error is passed back for the caller to show/undo.
 */
export async function runWithQueueFallback(
  action: QueuedActionInput,
  execute: () => PromiseLike<{ error: PostgrestError | null }>
): Promise<{ queued: boolean; error: PostgrestError | null }> {
  const { error } = await execute();
  if (!error) return { queued: false, error: null };
  if (isNetworkError(error)) {
    enqueue(action);
    return { queued: true, error: null };
  }
  return { queued: false, error };
}

let flushing = false;

/** Replays queued actions in order; stops (to retry later) at the first one that still can't reach the network. */
export async function flushQueue(): Promise<void> {
  if (flushing) return;
  if (typeof navigator !== "undefined" && !navigator.onLine) return;
  flushing = true;
  try {
    let queue = readQueue();
    while (queue.length > 0) {
      const [next, ...rest] = queue;
      const { error } = await runAction(next);
      if (error && isNetworkError(error)) break;
      queue = rest;
      writeQueue(queue);
    }
  } finally {
    flushing = false;
  }
}

const RETRY_INTERVAL_MS = 30_000;

export function initSyncQueue() {
  if (typeof window === "undefined") return;
  window.addEventListener("online", () => void flushQueue());
  void flushQueue();
  // Belt-and-suspenders for flaky/captive-portal connections where
  // navigator.onLine reports true but requests still fail (common on
  // weak supermarket wifi) -- the "online" event alone won't fire again
  // in that case, so pending changes would otherwise sit until the app
  // is reloaded.
  window.setInterval(() => {
    if (pendingCount() > 0) void flushQueue();
  }, RETRY_INTERVAL_MS);
}

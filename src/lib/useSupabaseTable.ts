"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { supabase } from "@/lib/supabaseClient";

// Module-level, so it survives unmount/remount (e.g. switching bottom-nav
// tabs and coming back). Every hook instance for the same table+query
// shares one entry: first render paints last-known data immediately
// (stale-while-revalidate) instead of an empty list + spinner, while a
// fresh fetch still runs in the background to reconcile it.
const rowsCache = new Map<string, unknown[]>();

function cacheKey(table: string, select: string, orderBy?: { column: string; ascending?: boolean }) {
  return `${table}::${select}::${orderBy?.column ?? ""}::${orderBy?.ascending ?? ""}`;
}

/**
 * Fetches all rows from a Supabase table and keeps them in sync in
 * real-time via Postgres change notifications. Any insert/update/delete
 * from any client (or the SQL editor) triggers a refetch here. The
 * returned `refetch` lets a mutating component get instant feedback
 * on its own writes instead of waiting for the realtime echo.
 */
export function useSupabaseTable<T>(
  table: string,
  select = "*",
  orderBy?: { column: string; ascending?: boolean }
) {
  const key = cacheKey(table, select, orderBy);
  const [rows, setRows] = useState<T[]>(() => (rowsCache.get(key) as T[] | undefined) ?? []);
  const [loading, setLoading] = useState(() => !rowsCache.has(key));
  const isMountedRef = useRef(true);

  const load = useCallback(async () => {
    let query = supabase.from(table).select(select);
    if (orderBy) {
      query = query.order(orderBy.column, { ascending: orderBy.ascending ?? true });
    }
    const { data, error } = await query;
    if (!isMountedRef.current) return;
    if (!error && data) {
      rowsCache.set(key, data as T[]);
      setRows(data as T[]);
    }
    setLoading(false);
    // Depend on orderBy's primitive fields rather than the object itself --
    // callers often pass a fresh object literal each render, which would
    // otherwise recreate `load` (and resubscribe) on every render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, table, select, orderBy?.column, orderBy?.ascending]);

  useEffect(() => {
    isMountedRef.current = true;
    // Always refetch on mount/table change to reconcile the cached (or
    // empty) initial state with the server; this is the documented
    // exception for hydrating from an external system (Supabase) that
    // useEffect exists for -- it can't happen during render.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    load();

    const channel = supabase
      .channel(`realtime:${table}`)
      .on("postgres_changes", { event: "*", schema: "public", table }, () => {
        load();
      })
      .subscribe();

    return () => {
      isMountedRef.current = false;
      supabase.removeChannel(channel);
    };
  }, [table, load]);

  return { rows, loading, refetch: load };
}

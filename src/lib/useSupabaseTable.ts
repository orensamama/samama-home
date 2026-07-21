"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { supabase } from "@/lib/supabaseClient";

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
  const [rows, setRows] = useState<T[]>([]);
  const [loading, setLoading] = useState(true);
  const isMountedRef = useRef(true);

  const load = useCallback(async () => {
    let query = supabase.from(table).select(select);
    if (orderBy) {
      query = query.order(orderBy.column, { ascending: orderBy.ascending ?? true });
    }
    const { data, error } = await query;
    if (!isMountedRef.current) return;
    if (!error && data) {
      setRows(data as T[]);
    }
    setLoading(false);
    // Depend on orderBy's primitive fields rather than the object itself --
    // callers often pass a fresh object literal each render, which would
    // otherwise recreate `load` (and resubscribe) on every render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [table, select, orderBy?.column, orderBy?.ascending]);

  useEffect(() => {
    isMountedRef.current = true;
    // Initial fetch on mount/table change; this is the documented exception
    // for hydrating from an external system (Supabase) that useEffect exists
    // for -- it can't happen during render.
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

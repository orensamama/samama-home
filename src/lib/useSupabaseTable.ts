"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabaseClient";

/**
 * Fetches all rows from a Supabase table and keeps them in sync in
 * real-time via Postgres change notifications. Any insert/update/delete
 * from any client (or the SQL editor) triggers a refetch here.
 */
export function useSupabaseTable<T>(
  table: string,
  select = "*",
  orderBy?: { column: string; ascending?: boolean }
) {
  const [rows, setRows] = useState<T[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let isMounted = true;

    async function load() {
      let query = supabase.from(table).select(select);
      if (orderBy) {
        query = query.order(orderBy.column, { ascending: orderBy.ascending ?? true });
      }
      const { data, error } = await query;
      if (!isMounted) return;
      if (!error && data) {
        setRows(data as T[]);
      }
      setLoading(false);
    }

    load();

    const channel = supabase
      .channel(`realtime:${table}`)
      .on("postgres_changes", { event: "*", schema: "public", table }, () => {
        load();
      })
      .subscribe();

    return () => {
      isMounted = false;
      supabase.removeChannel(channel);
    };
    // Depend on orderBy's primitive fields rather than the object itself --
    // callers often pass a fresh object literal each render, which would
    // otherwise resubscribe on every render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [table, select, orderBy?.column, orderBy?.ascending]);

  return { rows, loading };
}

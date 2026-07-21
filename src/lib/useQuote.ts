"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import { DEFAULT_QUOTE } from "@/lib/familyData";

/**
 * The family quote is a single shared row (id = 1) synced in real-time
 * across every client via Postgres change notifications.
 */
export function useQuote() {
  const [quote, setQuoteState] = useState(DEFAULT_QUOTE);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let isMounted = true;

    async function load() {
      const { data, error } = await supabase
        .from("quote")
        .select("text")
        .eq("id", 1)
        .single();
      if (!isMounted) return;
      if (!error && data) {
        setQuoteState(data.text as string);
      }
      setLoading(false);
    }

    load();

    const channel = supabase
      .channel("realtime:quote")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "quote" },
        (payload) => {
          const newText = (payload.new as { text?: string } | null)?.text;
          if (newText) setQuoteState(newText);
        }
      )
      .subscribe();

    return () => {
      isMounted = false;
      supabase.removeChannel(channel);
    };
  }, []);

  async function updateQuote(text: string) {
    const trimmed = text.trim();
    const finalText = trimmed.length > 0 ? trimmed : DEFAULT_QUOTE;
    setQuoteState(finalText);
    const { error } = await supabase
      .from("quote")
      .update({ text: finalText, updated_at: new Date().toISOString() })
      .eq("id", 1);
    return error;
  }

  return { quote, setQuote: updateQuote, loading };
}

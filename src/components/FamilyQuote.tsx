"use client";

import { useState } from "react";
import { Check, X } from "lucide-react";
import { useQuote } from "@/lib/useQuote";
import { friendlyErrorMessage, logSupabaseError } from "@/lib/supabaseErrors";
import ErrorBanner from "@/components/ErrorBanner";

export default function FamilyQuote() {
  const { quote, setQuote } = useQuote();
  const [isEditing, setIsEditing] = useState(false);
  const [draft, setDraft] = useState(quote);
  const [error, setError] = useState<string | null>(null);

  function startEditing() {
    setDraft(quote);
    setError(null);
    setIsEditing(true);
  }

  async function save() {
    const err = await setQuote(draft);
    if (err) {
      logSupabaseError("שמירת ציטוט משפחתי", err);
      setError(friendlyErrorMessage(err));
      return;
    }
    setIsEditing(false);
  }

  if (isEditing) {
    return (
      <div className="mt-4 flex w-full max-w-xs flex-col gap-2 rounded-2xl border border-amber-200 bg-white p-3 shadow-sm dark:border-amber-900/50 dark:bg-stone-900">
        {error && <ErrorBanner message={error} onDismiss={() => setError(null)} />}
        <textarea
          autoFocus
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          rows={2}
          className="w-full resize-none rounded-lg border border-amber-200 bg-amber-50/60 p-2 text-sm text-stone-700 outline-none focus:border-amber-400 dark:border-amber-900/50 dark:bg-stone-950 dark:text-stone-200"
        />
        <div className="mt-2 flex justify-center gap-2">
          <button
            type="button"
            onClick={save}
            className="flex items-center gap-1 rounded-full bg-amber-500 px-3 py-1 text-xs font-medium text-white hover:bg-amber-600"
          >
            <Check className="h-3.5 w-3.5" />
            שמירה
          </button>
          <button
            type="button"
            onClick={() => setIsEditing(false)}
            className="flex items-center gap-1 rounded-full border border-stone-300 px-3 py-1 text-xs font-medium text-stone-600 hover:bg-stone-100 dark:border-stone-700 dark:text-stone-300 dark:hover:bg-stone-800"
          >
            <X className="h-3.5 w-3.5" />
            ביטול
          </button>
        </div>
      </div>
    );
  }

  return (
    <button
      type="button"
      onClick={startEditing}
      aria-label="לחצו לעריכת הציטוט המשפחתי"
      className="mt-4 max-w-xs rounded-2xl border border-amber-200/70 bg-white/80 px-4 py-2.5 text-center text-sm italic text-stone-700 shadow-sm transition-colors hover:border-amber-300 hover:bg-amber-50 dark:border-amber-900/40 dark:bg-stone-900/70 dark:text-stone-200 dark:hover:bg-stone-800/70"
    >
      “{quote}”
    </button>
  );
}

"use client";

import { useState } from "react";
import { Check, Pencil, Quote as QuoteIcon, X } from "lucide-react";
import { useLocalStorage } from "@/lib/useLocalStorage";
import { DEFAULT_QUOTE } from "@/lib/familyData";

export default function FamilyQuote() {
  const [quote, setQuote] = useLocalStorage<string>("samama-quote", DEFAULT_QUOTE);
  const [isEditing, setIsEditing] = useState(false);
  const [draft, setDraft] = useState(quote);

  function startEditing() {
    setDraft(quote);
    setIsEditing(true);
  }

  function save() {
    const trimmed = draft.trim();
    setQuote(trimmed.length > 0 ? trimmed : DEFAULT_QUOTE);
    setIsEditing(false);
  }

  if (isEditing) {
    return (
      <div className="mt-4 w-full max-w-xs rounded-2xl border border-amber-200 bg-white p-3 shadow-sm dark:border-amber-900/50 dark:bg-stone-900">
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
    <div className="mt-4 flex max-w-xs items-center gap-2 rounded-2xl border border-amber-200/70 bg-white/80 px-4 py-2.5 text-sm text-stone-700 shadow-sm dark:border-amber-900/40 dark:bg-stone-900/70 dark:text-stone-200">
      <QuoteIcon className="h-4 w-4 shrink-0 text-amber-500" aria-hidden="true" />
      <span className="italic">{quote}</span>
      <button
        type="button"
        onClick={startEditing}
        aria-label="עריכת הציטוט המשפחתי"
        className="shrink-0 rounded-full p-1 text-stone-400 transition-colors hover:bg-amber-100 hover:text-amber-600 dark:hover:bg-amber-950/40 dark:hover:text-amber-400"
      >
        <Pencil className="h-3.5 w-3.5" />
      </button>
    </div>
  );
}

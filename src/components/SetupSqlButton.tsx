"use client";

import { useState } from "react";
import { Check, ClipboardCopy } from "lucide-react";
import { SETUP_SQL } from "@/lib/generated/setupSql";

/**
 * Copies the one-time, idempotent database setup SQL (migration 0018) so it
 * can be pasted into Supabase's SQL Editor. Falls back to showing the text
 * for manual copying when the clipboard isn't available.
 */
export default function SetupSqlButton({ className = "" }: { className?: string }) {
  const [state, setState] = useState<"idle" | "copied" | "manual">("idle");

  async function handleCopy() {
    try {
      await navigator.clipboard.writeText(SETUP_SQL);
      setState("copied");
      setTimeout(() => setState("idle"), 2500);
    } catch {
      setState("manual");
    }
  }

  return (
    <div className="flex flex-col gap-2">
      <button
        type="button"
        onClick={handleCopy}
        className={`flex w-fit items-center gap-1.5 rounded-xl bg-amber-500 px-3 py-2 text-sm font-semibold text-white transition-colors hover:bg-amber-600 ${className}`}
      >
        {state === "copied" ? <Check className="h-4 w-4" /> : <ClipboardCopy className="h-4 w-4" />}
        {state === "copied" ? "הועתק!" : "העתק SQL לתיקון"}
      </button>
      {state === "manual" && (
        <textarea
          readOnly
          value={SETUP_SQL}
          onFocus={(event) => event.currentTarget.select()}
          rows={8}
          dir="ltr"
          className="w-full rounded-xl border border-amber-200 bg-white p-2 font-mono text-[11px] text-stone-700 dark:border-amber-900/50 dark:bg-stone-950 dark:text-stone-200"
        />
      )}
    </div>
  );
}

"use client";

import { useState } from "react";
import { ChevronDown, TriangleAlert } from "lucide-react";
import SetupSqlButton from "@/components/SetupSqlButton";
import type { BudgetSetupStatus } from "@/lib/useBudget";

/**
 * Shown on the budget screen only when something is genuinely wrong with the
 * database (missing table/column/permission) -- says what, and gives the
 * one-time fix. When the categories table is merely empty the app seeds the
 * template by itself and this never appears.
 */
export default function BudgetSetupBanner({ setup }: { setup: BudgetSetupStatus }) {
  const [showDetails, setShowDetails] = useState(false);

  if (setup.checking) {
    return (
      <div className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800 dark:border-amber-900/40 dark:bg-amber-950/20 dark:text-amber-300">
        בודק את הגדרות כלכלת המשפחה...
      </div>
    );
  }
  if (setup.issues.length === 0) return null;

  return (
    <div className="flex flex-col gap-3 rounded-2xl border border-amber-300 bg-amber-50 p-4 dark:border-amber-800 dark:bg-amber-950/20">
      <div className="flex items-start gap-2">
        <TriangleAlert className="mt-0.5 h-5 w-5 shrink-0 text-amber-600 dark:text-amber-400" />
        <div className="min-w-0">
          <p className="text-sm font-bold text-stone-800 dark:text-stone-100">צריך להשלים הגדרה חד־פעמית במסד הנתונים</p>
          <ul className="mt-1 list-disc ps-5 text-xs text-stone-600 dark:text-stone-300">
            {setup.issues.map((issue) => (
              <li key={`${issue.area}-${issue.technical}`}>{issue.message}</li>
            ))}
          </ul>
        </div>
      </div>

      <ol className="list-decimal ps-5 text-xs text-stone-600 dark:text-stone-300">
        <li>לחצו &quot;העתק SQL לתיקון&quot;.</li>
        <li>ב-Supabase: SQL Editor ← New query ← הדביקו ← Run (בטוח להרצה, לא מוחק כלום).</li>
        <li>חזרו לכאן ולחצו &quot;בדקו שוב&quot; - הקטגוריות יטענו אוטומטית.</li>
      </ol>

      <div className="flex flex-wrap items-start gap-2">
        <SetupSqlButton />
        <button
          type="button"
          onClick={setup.recheck}
          className="rounded-xl border border-amber-300 px-3 py-2 text-sm font-medium text-amber-700 transition-colors hover:bg-amber-100 dark:border-amber-800 dark:text-amber-400 dark:hover:bg-stone-800"
        >
          בדקו שוב
        </button>
      </div>

      <button
        type="button"
        onClick={() => setShowDetails((value) => !value)}
        className="flex w-fit items-center gap-1 text-[11px] text-stone-500 dark:text-stone-400"
      >
        פרטים טכניים
        <ChevronDown className={`h-3 w-3 transition-transform ${showDetails ? "rotate-180" : ""}`} />
      </button>
      {showDetails && (
        <pre dir="ltr" className="overflow-x-auto whitespace-pre-wrap rounded-lg bg-white/70 p-2 text-[10px] text-stone-600 dark:bg-stone-900/60 dark:text-stone-300">
          {setup.issues.map((issue) => `${issue.area}: ${issue.technical}`).join("\n")}
        </pre>
      )}
    </div>
  );
}

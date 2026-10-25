"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { PiggyBank, Plus } from "lucide-react";
import ExpenseFormModal from "@/components/ExpenseFormModal";
import { SkeletonBlock } from "@/components/Skeleton";
import { useBudgetData } from "@/lib/useBudget";
import { saveExpense } from "@/lib/budgetActions";
import { friendlyErrorMessage } from "@/lib/supabaseErrors";
import { formatCurrency } from "@/lib/familyData";
import {
  computeBudgetSummary,
  defaultDateForMonth,
  formatMonthKey,
  monthKeyFromOffset,
  type ExpenseFormValues,
} from "@/lib/budgetData";

/**
 * Compact family-budget card for the dashboard: what's left to live on this
 * month, a hairline progress bar, and a one-tap "+ הוצאה" that opens the
 * quick-entry form in place. The rest of the card opens the budget tab.
 */
export default function BudgetWidget() {
  const { categories, expenses, merchants, setup } = useBudgetData();
  const [showForm, setShowForm] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const monthKey = monthKeyFromOffset(0);
  const summary = useMemo(
    () => computeBudgetSummary(categories.rows, expenses.rows, monthKey),
    [categories.rows, expenses.rows, monthKey]
  );

  if (categories.loading && categories.rows.length === 0) {
    return <SkeletonBlock className="h-[88px] w-full" />;
  }

  const hasStructure = categories.rows.length > 0;
  const needsSetup = !hasStructure && !setup.checking && setup.issues.length > 0;
  const negative = summary.remaining < 0;
  const usedRatio = summary.variableBudget > 0 ? Math.min(1, summary.variableSpent / summary.variableBudget) : 0;
  const barTone = usedRatio >= 1 ? "bg-rose-500" : usedRatio >= 0.75 ? "bg-amber-500" : "bg-emerald-500";

  async function handleSubmit(values: ExpenseFormValues) {
    setFormError(null);
    const { error } = await saveExpense({
      values,
      editingId: null,
      categories: categories.rows,
      merchants: merchants.rows,
    });
    if (error) {
      setFormError(friendlyErrorMessage(error));
      return;
    }
    merchants.refetch();
    await expenses.refetch();
    setShowForm(false);
  }

  return (
    <>
      <div className="relative overflow-hidden rounded-2xl border border-amber-100 bg-white px-4 pb-3 pt-3 shadow-sm dark:border-amber-950/30 dark:bg-stone-900">
        {/* The card itself navigates to the budget tab; the button sits above this layer. */}
        <Link href="/budget" aria-label="מעבר לכלכלת המשפחה" className="absolute inset-0 z-0" />

        <div className="pointer-events-none relative z-10 flex items-center gap-3">
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-amber-50 text-amber-600 dark:bg-amber-950/40 dark:text-amber-400">
            <PiggyBank className="h-5 w-5" />
          </span>

          <div className="min-w-0 flex-1">
            <p className="truncate text-[11px] text-stone-400 dark:text-stone-500">
              נשאר לחיות החודש · {formatMonthKey(monthKey)}
            </p>
            {needsSetup ? (
              <p className="text-sm font-medium text-amber-700 dark:text-amber-400">נדרשת הגדרה קצרה - לחצו להמשך</p>
            ) : (
              <p
                className={`text-2xl font-bold tabular-nums leading-tight ${
                  !hasStructure
                    ? "text-stone-300 dark:text-stone-600"
                    : negative
                      ? "text-rose-600 dark:text-rose-400"
                      : "text-emerald-700 dark:text-emerald-400"
                }`}
              >
                {hasStructure ? formatCurrency(summary.remaining) : "—"}
              </p>
            )}
          </div>

          <button
            type="button"
            onClick={() => {
              setFormError(null);
              setShowForm(true);
            }}
            className="pointer-events-auto flex shrink-0 items-center gap-1 rounded-full bg-amber-500 px-3.5 py-2 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-amber-600 active:scale-95"
          >
            <Plus className="h-4 w-4" />
            הוצאה
          </button>
        </div>

        {hasStructure && summary.variableBudget > 0 && (
          <div className="relative z-10 mt-2.5 h-1 w-full overflow-hidden rounded-full bg-stone-100 dark:bg-stone-800">
            <div className={`h-full rounded-full transition-all ${barTone}`} style={{ width: `${Math.round(usedRatio * 100)}%` }} />
          </div>
        )}
      </div>

      {showForm && (
        <ExpenseFormModal
          editingExpense={null}
          defaultDate={defaultDateForMonth(monthKey)}
          categories={categories.rows}
          merchants={merchants.rows}
          error={formError}
          onDismissError={() => setFormError(null)}
          onClose={() => {
            setShowForm(false);
            setFormError(null);
          }}
          onSubmit={handleSubmit}
        />
      )}
    </>
  );
}

"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { Plus } from "lucide-react";
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
 * The family budget at a glance, kept small: the available balance for the
 * month, income vs. spent so far on one line, and a one-tap "+ הוצאה חדשה".
 * The card opens the budget tab; the button opens the quick-entry form in place.
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
    return <SkeletonBlock className="h-28 w-full" />;
  }

  const hasStructure = categories.rows.length > 0;
  const needsSetup = !hasStructure && !setup.checking && setup.issues.length > 0;
  const negative = summary.remaining < 0;
  const usedRatio = summary.income > 0 ? Math.min(1, summary.totalSpent / summary.income) : 0;
  const barTone = usedRatio >= 1 ? "bg-rose-300" : usedRatio >= 0.85 ? "bg-amber-300" : "bg-white/80";

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
      <div
        className={`relative overflow-hidden rounded-2xl px-4 py-3 text-white shadow-md ${
          negative
            ? "bg-gradient-to-br from-rose-500 to-orange-500 shadow-rose-200/50 dark:shadow-none"
            : "bg-gradient-to-br from-emerald-500 to-teal-600 shadow-emerald-200/50 dark:shadow-none"
        }`}
      >
        <div aria-hidden="true" className="pointer-events-none absolute -left-8 -top-10 h-28 w-28 rounded-full bg-white/20 blur-2xl" />

        {/* The card navigates to the budget tab; the button sits above this layer. */}
        <Link href="/budget" aria-label="מעבר לכלכלת המשפחה" className="absolute inset-0 z-0" />

        <div className="pointer-events-none relative z-10 flex flex-col gap-2">
          <div className="flex items-end justify-between gap-3">
            <div className="min-w-0">
              <p className="truncate text-xs font-medium text-white/80">
                יתרת תקציב פנויה · {formatMonthKey(monthKey)}
              </p>
              {needsSetup ? (
                <p className="mt-0.5 text-sm font-semibold">נדרשת הגדרה קצרה - לחצו להמשך</p>
              ) : (
                <p className="text-3xl font-extrabold tabular-nums leading-tight">
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
              className="pointer-events-auto flex shrink-0 items-center gap-1 rounded-xl bg-white px-3 py-2 text-xs font-bold text-stone-800 shadow-sm transition active:scale-95 hover:bg-white/90"
            >
              <Plus className="h-3.5 w-3.5" />
              הוצאה חדשה
            </button>
          </div>

          {hasStructure && (
            <>
              <p className="text-[11px] text-white/85">
                הכנסות <span className="font-semibold tabular-nums">{formatCurrency(summary.income)}</span>
                <span className="mx-1.5 text-white/50">·</span>
                הוצאות עד כה <span className="font-semibold tabular-nums">{formatCurrency(summary.totalSpent)}</span>
              </p>
              {summary.income > 0 && (
                <div className="h-1 w-full overflow-hidden rounded-full bg-white/25">
                  <div className={`h-full rounded-full transition-all ${barTone}`} style={{ width: `${Math.round(usedRatio * 100)}%` }} />
                </div>
              )}
            </>
          )}
        </div>
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

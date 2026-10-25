"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { ChevronLeft, PiggyBank, Plus } from "lucide-react";
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
 * The family-budget hero on the main dashboard: live "how much is left to
 * live on this month", a one-tap "new expense" that opens the quick-entry
 * form right here, and the whole card links to the full budget screen.
 */
export default function BudgetWidget() {
  const { categories, expenses, merchants } = useBudgetData();
  const [showForm, setShowForm] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const monthKey = monthKeyFromOffset(0);
  const summary = useMemo(
    () => computeBudgetSummary(categories.rows, expenses.rows, monthKey),
    [categories.rows, expenses.rows, monthKey]
  );

  if (categories.loading && categories.rows.length === 0) {
    return <SkeletonBlock className="h-44 w-full" />;
  }

  const hasStructure = categories.rows.length > 0;
  const negative = summary.remaining < 0;
  const usedRatio = summary.variableBudget > 0 ? Math.min(1, summary.variableSpent / summary.variableBudget) : 0;

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
        className={`relative overflow-hidden rounded-3xl p-5 text-white shadow-lg ring-1 ring-black/5 ${
          negative
            ? "bg-gradient-to-br from-rose-500 via-rose-600 to-orange-600"
            : "bg-gradient-to-br from-emerald-500 via-emerald-600 to-teal-700"
        }`}
      >
        {/* Whole card navigates to the budget screen; the button below sits above this layer. */}
        <Link href="/budget" aria-label="מעבר לכלכלת המשפחה" className="absolute inset-0 z-0" />

        <div className="pointer-events-none absolute -left-8 -top-10 h-36 w-36 rounded-full bg-white/10" aria-hidden="true" />
        <div className="pointer-events-none absolute -bottom-12 right-6 h-28 w-28 rounded-full bg-white/10" aria-hidden="true" />

        <div className="pointer-events-none relative z-10 flex flex-col gap-3">
          <div className="flex items-center justify-between gap-2">
            <span className="flex items-center gap-2 text-sm font-semibold text-white/90">
              <span className="flex h-8 w-8 items-center justify-center rounded-full bg-white/20">
                <PiggyBank className="h-4.5 w-4.5" />
              </span>
              כלכלת המשפחה · {formatMonthKey(monthKey)}
            </span>
            <ChevronLeft className="h-5 w-5 text-white/70" aria-hidden="true" />
          </div>

          <div>
            <p className="text-sm text-white/85">נשאר לנו לחיות החודש</p>
            <p className="text-4xl font-extrabold tabular-nums tracking-tight">
              {hasStructure ? formatCurrency(summary.remaining) : "—"}
            </p>
          </div>

          {hasStructure ? (
            <>
              {summary.variableBudget > 0 && (
                <div className="h-2 w-full overflow-hidden rounded-full bg-white/25">
                  <div
                    className={`h-full rounded-full ${usedRatio >= 1 ? "bg-rose-200" : usedRatio >= 0.75 ? "bg-amber-200" : "bg-white"}`}
                    style={{ width: `${Math.round(usedRatio * 100)}%` }}
                  />
                </div>
              )}
              <p className="text-xs text-white/80">
                הכנסות {formatCurrency(summary.income)} · הוצאנו {formatCurrency(summary.totalSpent)}
                {summary.income === 0 && " · הגדירו הכנסות בלשונית כלכלה"}
              </p>
            </>
          ) : (
            <p className="text-xs text-white/80">לחצו כדי להגדיר תקציב משפחתי</p>
          )}

          <button
            type="button"
            onClick={() => {
              setFormError(null);
              setShowForm(true);
            }}
            className="pointer-events-auto flex w-fit items-center gap-1.5 rounded-full bg-white px-4 py-2 text-sm font-bold text-emerald-700 shadow-sm transition-transform hover:scale-[1.03] active:scale-95 dark:text-emerald-800"
          >
            <Plus className="h-4 w-4" />
            הוצאה חדשה
          </button>
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

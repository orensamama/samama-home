"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { ArrowDownCircle, ArrowUpCircle, ChevronLeft, Plus, Wallet } from "lucide-react";
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
 * The family budget at a glance, front and centre on the dashboard: what's left
 * to live on this month (big), this month's income vs. what's been spent so far,
 * and a one-tap "+ הוצאה חדשה". The card opens the budget tab; the button opens
 * the quick-entry form in place.
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
    return <SkeletonBlock className="h-44 w-full" />;
  }

  const hasStructure = categories.rows.length > 0;
  const needsSetup = !hasStructure && !setup.checking && setup.issues.length > 0;
  const negative = summary.remaining < 0;
  const usedRatio = summary.income > 0 ? Math.min(1, summary.totalSpent / summary.income) : 0;
  const barTone = usedRatio >= 1 ? "bg-rose-400" : usedRatio >= 0.85 ? "bg-amber-400" : "bg-emerald-400";

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
        className={`relative overflow-hidden rounded-3xl p-5 text-white shadow-lg ${
          negative
            ? "bg-gradient-to-br from-rose-500 via-rose-500 to-orange-500 shadow-rose-200/60 dark:shadow-none"
            : "bg-gradient-to-br from-emerald-500 via-teal-500 to-cyan-600 shadow-emerald-200/60 dark:shadow-none"
        }`}
      >
        {/* Soft glow so the card lights up the page. */}
        <div aria-hidden="true" className="pointer-events-none absolute -left-10 -top-12 h-44 w-44 rounded-full bg-white/20 blur-2xl" />
        <div aria-hidden="true" className="pointer-events-none absolute -bottom-16 -right-8 h-40 w-40 rounded-full bg-white/10 blur-2xl" />

        {/* The card navigates to the budget tab; the controls sit above this layer. */}
        <Link href="/budget" aria-label="מעבר לכלכלת המשפחה" className="absolute inset-0 z-0" />

        <div className="pointer-events-none relative z-10 flex flex-col gap-4">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="flex items-center gap-1.5 text-sm font-medium text-white/85">
                <Wallet className="h-4 w-4" />
                נשאר לנו לחיות החודש
              </p>
              {needsSetup ? (
                <p className="mt-2 text-base font-semibold">נדרשת הגדרה קצרה - לחצו להמשך</p>
              ) : (
                <p className="mt-1 text-4xl font-extrabold tabular-nums leading-tight drop-shadow-sm">
                  {hasStructure ? formatCurrency(summary.remaining) : "—"}
                </p>
              )}
            </div>
            <span className="flex shrink-0 items-center gap-0.5 rounded-full bg-white/20 px-2.5 py-1 text-xs font-medium backdrop-blur-sm">
              {formatMonthKey(monthKey)}
              <ChevronLeft className="h-3 w-3" />
            </span>
          </div>

          {hasStructure && (
            <>
              <div className="grid grid-cols-2 gap-2">
                <div className="rounded-2xl bg-white/15 px-3 py-2 backdrop-blur-sm">
                  <p className="flex items-center gap-1 text-[11px] text-white/80">
                    <ArrowDownCircle className="h-3.5 w-3.5" />
                    הכנסות
                  </p>
                  <p className="text-lg font-bold tabular-nums">{formatCurrency(summary.income)}</p>
                </div>
                <div className="rounded-2xl bg-white/15 px-3 py-2 backdrop-blur-sm">
                  <p className="flex items-center gap-1 text-[11px] text-white/80">
                    <ArrowUpCircle className="h-3.5 w-3.5" />
                    הוצאות עד כה
                  </p>
                  <p className="text-lg font-bold tabular-nums">{formatCurrency(summary.totalSpent)}</p>
                </div>
              </div>

              {summary.income > 0 && (
                <div className="h-1.5 w-full overflow-hidden rounded-full bg-white/25">
                  <div className={`h-full rounded-full transition-all ${barTone}`} style={{ width: `${Math.round(usedRatio * 100)}%` }} />
                </div>
              )}
            </>
          )}

          <button
            type="button"
            onClick={() => {
              setFormError(null);
              setShowForm(true);
            }}
            className="pointer-events-auto flex w-full items-center justify-center gap-1.5 rounded-2xl bg-white px-4 py-3 text-sm font-bold text-stone-800 shadow-sm transition active:scale-[0.98] hover:bg-white/90"
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

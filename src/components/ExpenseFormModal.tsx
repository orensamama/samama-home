"use client";

import { useState, type FormEvent } from "react";
import { X } from "lucide-react";
import type { ExpenseItem } from "@/lib/familyData";
import ErrorBanner from "@/components/ErrorBanner";

export type ExpenseFormValues = {
  title: string;
  amount: string;
  amount_pending: boolean;
  date: string;
  notes: string;
};

function toFormValues(expense: ExpenseItem | null): ExpenseFormValues {
  if (!expense) {
    const today = new Date();
    const iso = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}-${String(today.getDate()).padStart(2, "0")}`;
    return { title: "", amount: "", amount_pending: false, date: iso, notes: "" };
  }
  return {
    title: expense.title,
    amount: expense.amount_pending ? "" : String(expense.amount),
    amount_pending: expense.amount_pending,
    date: expense.date,
    notes: expense.notes ?? "",
  };
}

export default function ExpenseFormModal({
  editingExpense,
  error,
  onDismissError,
  onClose,
  onSubmit,
}: {
  editingExpense: ExpenseItem | null | undefined;
  error?: string | null;
  onDismissError: () => void;
  onClose: () => void;
  onSubmit: (values: ExpenseFormValues) => Promise<void>;
}) {
  const [values, setValues] = useState<ExpenseFormValues>(() => toFormValues(editingExpense ?? null));
  const [submitting, setSubmitting] = useState(false);

  const parsedAmount = Number(values.amount);
  const isValid =
    values.title.trim() &&
    values.date &&
    (values.amount_pending || (values.amount !== "" && !Number.isNaN(parsedAmount) && parsedAmount > 0));

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    if (!isValid || submitting) return;
    setSubmitting(true);
    await onSubmit(values);
    setSubmitting(false);
  }

  return (
    <div className="fixed inset-0 z-[60] flex items-end justify-center bg-black/40 sm:items-center">
      <div className="flex max-h-[85dvh] w-full flex-col overflow-hidden rounded-t-3xl bg-white shadow-lg sm:max-w-md sm:rounded-3xl dark:bg-stone-900">
        <div className="flex shrink-0 items-center justify-between border-b border-amber-100 p-4 dark:border-amber-950/30">
          <h2 className="text-lg font-bold text-stone-800 dark:text-stone-100">
            {editingExpense ? "עריכת הוצאה" : "הוצאה חדשה"}
          </h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="סגירה"
            className="rounded-full p-1.5 text-stone-400 hover:bg-stone-100 dark:hover:bg-stone-800"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="flex min-h-0 flex-1 flex-col">
          <div className="flex flex-1 flex-col gap-3 overflow-y-auto p-4">
            {error && <ErrorBanner message={error} onDismiss={onDismissError} />}

            <div>
              <p className="mb-1.5 text-xs font-medium text-stone-500 dark:text-stone-400">שם ההוצאה</p>
              <input
                type="text"
                autoFocus
                value={values.title}
                onChange={(event) => setValues((v) => ({ ...v, title: event.target.value }))}
                placeholder="שם ההוצאה..."
                className="w-full rounded-xl border border-amber-200 bg-white px-3 py-2 text-sm text-stone-700 outline-none focus:border-amber-400 dark:border-amber-900/50 dark:bg-stone-950 dark:text-stone-200"
              />
            </div>

            <div className="flex flex-col gap-3 sm:flex-row sm:gap-2">
              <div className="flex-1">
                <p className="mb-1.5 text-xs font-medium text-stone-500 dark:text-stone-400">סכום בש״ח</p>
                <input
                  type="number"
                  inputMode="decimal"
                  min="0"
                  step="0.01"
                  disabled={values.amount_pending}
                  value={values.amount}
                  onChange={(event) => setValues((v) => ({ ...v, amount: event.target.value }))}
                  placeholder="סכום בש״ח"
                  className="w-full rounded-xl border border-amber-200 bg-white px-3 py-2 text-sm text-stone-700 outline-none focus:border-amber-400 disabled:opacity-50 dark:border-amber-900/50 dark:bg-stone-950 dark:text-stone-200"
                />
              </div>
              <div className="flex-1">
                <p className="mb-1.5 text-xs font-medium text-stone-500 dark:text-stone-400">תאריך</p>
                <input
                  type="date"
                  value={values.date}
                  onChange={(event) => setValues((v) => ({ ...v, date: event.target.value }))}
                  className="w-full rounded-xl border border-amber-200 bg-white px-3 py-2 text-sm text-stone-700 outline-none focus:border-amber-400 dark:border-amber-900/50 dark:bg-stone-950 dark:text-stone-200"
                />
              </div>
            </div>

            <label className="flex items-center gap-2 rounded-xl border border-amber-100 bg-amber-50/60 px-3 py-2 text-sm text-stone-700 dark:border-amber-950/30 dark:bg-stone-950/40 dark:text-stone-200">
              <input
                type="checkbox"
                checked={values.amount_pending}
                onChange={(event) =>
                  setValues((v) => ({ ...v, amount_pending: event.target.checked }))
                }
                className="h-4 w-4 shrink-0 rounded border-amber-300 text-amber-500 focus:ring-amber-400"
              />
              🔍 סכום בבדיקה / בבירור (עדיין לא ידוע)
            </label>

            <div>
              <p className="mb-1.5 text-xs font-medium text-stone-500 dark:text-stone-400">הערות / פירוט</p>
              <textarea
                value={values.notes}
                onChange={(event) => setValues((v) => ({ ...v, notes: event.target.value }))}
                rows={3}
                placeholder="פרטים נוספים..."
                className="w-full resize-none rounded-xl border border-amber-200 bg-white px-3 py-2 text-sm text-stone-700 outline-none focus:border-amber-400 dark:border-amber-900/50 dark:bg-stone-950 dark:text-stone-200"
              />
            </div>
          </div>

          <div className="shrink-0 border-t border-amber-100 bg-white p-4 dark:border-amber-950/30 dark:bg-stone-900">
            <button
              type="submit"
              disabled={!isValid || submitting}
              className="w-full rounded-xl bg-amber-500 px-4 py-3 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-amber-600 disabled:opacity-50"
            >
              {editingExpense ? "שמירת שינויים" : "הוספת הוצאה"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

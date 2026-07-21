"use client";

import { useState, type FormEvent } from "react";
import { Plus, Trash2, Wallet } from "lucide-react";
import PageHeader from "@/components/PageHeader";
import ErrorBanner from "@/components/ErrorBanner";
import { useSupabaseTable } from "@/lib/useSupabaseTable";
import { supabase } from "@/lib/supabaseClient";
import { friendlyErrorMessage, logSupabaseError } from "@/lib/supabaseErrors";
import { formatCurrency, formatDate, type ExpenseItem } from "@/lib/familyData";

export default function ExpensesPage() {
  const { rows: expenses, refetch } = useSupabaseTable<ExpenseItem>(
    "expenses",
    "id, title, amount, date:expense_date",
    { column: "expense_date", ascending: false }
  );
  const [title, setTitle] = useState("");
  const [amount, setAmount] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const total = expenses.reduce((sum, expense) => sum + Number(expense.amount), 0);

  async function handleAdd(event: FormEvent) {
    event.preventDefault();
    const trimmedTitle = title.trim();
    const parsedAmount = Number(amount);
    if (!trimmedTitle || !amount || Number.isNaN(parsedAmount) || parsedAmount <= 0 || submitting) {
      return;
    }
    setSubmitting(true);
    setError(null);
    const { error: err } = await supabase
      .from("expenses")
      .insert({ title: trimmedTitle, amount: parsedAmount });
    if (err) {
      logSupabaseError("הוספת הוצאה", err);
      setError(friendlyErrorMessage(err));
      setSubmitting(false);
      return;
    }
    setTitle("");
    setAmount("");
    await refetch();
    setSubmitting(false);
  }

  async function remove(id: string) {
    setError(null);
    const { error: err } = await supabase.from("expenses").delete().eq("id", id);
    if (err) {
      logSupabaseError("מחיקת הוצאה", err);
      setError(friendlyErrorMessage(err));
      return;
    }
    refetch();
  }

  return (
    <div className="flex min-h-full flex-col">
      <PageHeader title="הוצאות גדולות" subtitle="מעקב אחר ההוצאות המשפחתיות" />

      <div className="flex flex-col gap-3 p-4">
        {error && <ErrorBanner message={error} onDismiss={() => setError(null)} />}

        <form
          onSubmit={handleAdd}
          className="flex flex-col gap-2 rounded-2xl border border-amber-100 bg-white p-3 shadow-sm dark:border-amber-950/30 dark:bg-stone-900"
        >
          <input
            type="text"
            value={title}
            onChange={(event) => setTitle(event.target.value)}
            placeholder="שם ההוצאה..."
            className="rounded-xl border border-amber-200 bg-white px-3 py-2 text-sm text-stone-700 outline-none focus:border-amber-400 dark:border-amber-900/50 dark:bg-stone-950 dark:text-stone-200"
          />
          <div className="flex gap-2">
            <input
              type="number"
              inputMode="decimal"
              min="0"
              step="0.01"
              value={amount}
              onChange={(event) => setAmount(event.target.value)}
              placeholder="סכום בש״ח"
              className="flex-1 rounded-xl border border-amber-200 bg-white px-3 py-2 text-sm text-stone-700 outline-none focus:border-amber-400 dark:border-amber-900/50 dark:bg-stone-950 dark:text-stone-200"
            />
            <button
              type="submit"
              disabled={!title.trim() || !amount || submitting}
              className="flex shrink-0 items-center gap-1 rounded-xl bg-amber-500 px-3 py-2 text-sm font-medium text-white transition-colors hover:bg-amber-600 disabled:opacity-50"
            >
              <Plus className="h-4 w-4" />
              הוספה
            </button>
          </div>
        </form>

        {expenses.length > 0 && (
          <div className="flex items-center justify-between rounded-2xl border border-amber-100 bg-amber-50 px-4 py-3 text-sm font-medium text-amber-800 dark:border-amber-950/30 dark:bg-amber-950/20 dark:text-amber-300">
            <span>סה&quot;כ הוצאות</span>
            <span className="text-base font-bold">{formatCurrency(total)}</span>
          </div>
        )}

        {expenses.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-amber-200 p-8 text-center text-sm text-stone-500 dark:border-amber-900/40 dark:text-stone-400">
            אין עדיין הוצאות רשומות. הוסיפו את ההוצאה הראשונה!
          </div>
        ) : (
          <ul className="flex flex-col gap-2">
            {expenses.map((expense) => (
              <li
                key={expense.id}
                className="flex items-center gap-3 rounded-2xl border border-amber-100 bg-white p-3 shadow-sm dark:border-amber-950/30 dark:bg-stone-900"
              >
                <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-amber-100 text-amber-600 dark:bg-amber-950/50 dark:text-amber-400">
                  <Wallet className="h-5 w-5" />
                </span>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium text-stone-800 dark:text-stone-100">
                    {expense.title}
                  </p>
                  <p className="text-xs text-stone-500 dark:text-stone-400">
                    {formatDate(expense.date)}
                  </p>
                </div>
                <span className="shrink-0 text-sm font-semibold text-stone-800 dark:text-stone-100">
                  {formatCurrency(Number(expense.amount))}
                </span>
                <button
                  type="button"
                  onClick={() => remove(expense.id)}
                  aria-label="מחיקה"
                  className="shrink-0 rounded-full p-1.5 text-stone-400 transition-colors hover:bg-red-50 hover:text-red-500 dark:hover:bg-red-950/30"
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

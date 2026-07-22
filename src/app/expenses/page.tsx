"use client";

import { useState } from "react";
import { Pencil, Plus, Trash2, Wallet } from "lucide-react";
import PageHeader from "@/components/PageHeader";
import ErrorBanner from "@/components/ErrorBanner";
import ExpenseFormModal, { type ExpenseFormValues } from "@/components/ExpenseFormModal";
import { useSupabaseTable } from "@/lib/useSupabaseTable";
import { supabase } from "@/lib/supabaseClient";
import { friendlyErrorMessage, logSupabaseError } from "@/lib/supabaseErrors";
import { formatCurrency, formatDate, type ExpenseItem } from "@/lib/familyData";

export default function ExpensesPage() {
  const { rows: expenses, refetch } = useSupabaseTable<ExpenseItem>(
    "expenses",
    "id, title, amount, amount_pending, notes, date:expense_date",
    { column: "expense_date", ascending: false }
  );
  const [showForm, setShowForm] = useState(false);
  const [editingExpense, setEditingExpense] = useState<ExpenseItem | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [pageError, setPageError] = useState<string | null>(null);

  const total = expenses.reduce((sum, expense) => sum + Number(expense.amount), 0);

  async function handleFormSubmit(values: ExpenseFormValues) {
    setFormError(null);
    const payload = {
      title: values.title.trim(),
      amount: values.amount_pending ? 0 : Number(values.amount),
      amount_pending: values.amount_pending,
      expense_date: values.date,
      notes: values.notes.trim() || null,
    };

    const { error } = editingExpense
      ? await supabase.from("expenses").update(payload).eq("id", editingExpense.id)
      : await supabase.from("expenses").insert(payload);

    if (error) {
      logSupabaseError("שמירת הוצאה", error);
      setFormError(friendlyErrorMessage(error));
      return;
    }

    await refetch();
    setShowForm(false);
    setEditingExpense(null);
  }

  async function remove(id: string) {
    setPageError(null);
    const { error: err } = await supabase.from("expenses").delete().eq("id", id);
    if (err) {
      logSupabaseError("מחיקת הוצאה", err);
      setPageError(friendlyErrorMessage(err));
      return;
    }
    refetch();
  }

  return (
    <div className="flex min-h-full flex-col">
      <PageHeader title="הוצאות גדולות" subtitle="מעקב אחר ההוצאות המשפחתיות" />

      <div className="flex flex-col gap-3 p-4">
        {pageError && <ErrorBanner message={pageError} onDismiss={() => setPageError(null)} />}

        <button
          type="button"
          onClick={() => {
            setEditingExpense(null);
            setFormError(null);
            setShowForm(true);
          }}
          className="flex items-center justify-center gap-1 rounded-xl bg-amber-500 px-3 py-2 text-sm font-medium text-white transition-colors hover:bg-amber-600"
        >
          <Plus className="h-4 w-4" />
          הוספת הוצאה
        </button>

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
                className="flex items-start gap-3 rounded-2xl border border-amber-100 bg-white p-3 shadow-sm dark:border-amber-950/30 dark:bg-stone-900"
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
                  {expense.notes && (
                    <p className="mt-1 whitespace-pre-wrap text-xs text-stone-500 dark:text-stone-400">
                      {expense.notes}
                    </p>
                  )}
                </div>
                {expense.amount_pending ? (
                  <span className="shrink-0 rounded-full bg-sky-100 px-2.5 py-1 text-xs font-semibold text-sky-700 dark:bg-sky-950/40 dark:text-sky-400">
                    🔍 בבירור
                  </span>
                ) : (
                  <span className="shrink-0 text-sm font-semibold text-stone-800 dark:text-stone-100">
                    {formatCurrency(Number(expense.amount))}
                  </span>
                )}
                <div className="flex shrink-0 flex-col gap-1">
                  <button
                    type="button"
                    onClick={() => {
                      setEditingExpense(expense);
                      setFormError(null);
                      setShowForm(true);
                    }}
                    aria-label="עריכת הוצאה"
                    className="rounded-full p-1.5 text-stone-400 transition-colors hover:bg-amber-100 hover:text-amber-600 dark:hover:bg-amber-950/40 dark:hover:text-amber-400"
                  >
                    <Pencil className="h-4 w-4" />
                  </button>
                  <button
                    type="button"
                    onClick={() => remove(expense.id)}
                    aria-label="מחיקה"
                    className="rounded-full p-1.5 text-stone-400 transition-colors hover:bg-red-50 hover:text-red-500 dark:hover:bg-red-950/30"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>

      {showForm && (
        <ExpenseFormModal
          editingExpense={editingExpense}
          error={formError}
          onDismissError={() => setFormError(null)}
          onClose={() => {
            setShowForm(false);
            setEditingExpense(null);
            setFormError(null);
          }}
          onSubmit={handleFormSubmit}
        />
      )}
    </div>
  );
}

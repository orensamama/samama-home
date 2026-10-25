"use client";

import { useCallback, useMemo, useState } from "react";
import { ChevronLeft, ChevronRight, ExternalLink, Pencil, Plus, Receipt, Check, Trash2 } from "lucide-react";
import type { PostgrestError } from "@supabase/supabase-js";
import PageHeader from "@/components/PageHeader";
import ErrorBanner from "@/components/ErrorBanner";
import { SkeletonList } from "@/components/Skeleton";
import BudgetKindSection, { type CategoryPatch } from "@/components/BudgetKindSection";
import ExpenseFormModal from "@/components/ExpenseFormModal";
import StoreMappingsPanel from "@/components/StoreMappingsPanel";
import { useBudgetData } from "@/lib/useBudget";
import { deleteMerchant, saveExpense, updateMerchant, upsertMerchant } from "@/lib/budgetActions";
import { useOptimisticRows } from "@/lib/useOptimisticRows";
import { supabase } from "@/lib/supabaseClient";
import { friendlyErrorMessage, logSupabaseError } from "@/lib/supabaseErrors";
import { formatCurrency, formatDate } from "@/lib/familyData";
import {
  KIND_ORDER,
  TONE_CLASSES,
  computeBudgetSummary,
  defaultDateForMonth,
  formatMonthKey,
  monthKeyFromOffset,
  monthOffsetFromDate,
  progressTone,
  type BudgetExpense,
  type BudgetKind,
  type ExpenseFormValues,
} from "@/lib/budgetData";

export default function BudgetPage() {
  const { categories: categoriesTable, expenses: expensesTable, merchants: merchantsTable } = useBudgetData();
  const { rows: serverCategories, loading: categoriesLoading, refetch: refetchCategories } = categoriesTable;
  const { rows: expenses, refetch: refetchExpenses } = expensesTable;
  const { rows: merchants, refetch: refetchMerchants } = merchantsTable;
  const categories = useOptimisticRows(serverCategories);

  const [monthOffset, setMonthOffset] = useState(0);
  const [manage, setManage] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [editingExpense, setEditingExpense] = useState<BudgetExpense | null>(null);
  const [formCategoryId, setFormCategoryId] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [pageError, setPageError] = useState<string | null>(null);

  const monthKey = monthKeyFromOffset(monthOffset);
  const summary = useMemo(
    () => computeBudgetSummary(categories.rows, expenses, monthKey),
    [categories.rows, expenses, monthKey]
  );
  const monthExpenses = useMemo(
    () => expenses.filter((expense) => expense.date.startsWith(monthKey)),
    [expenses, monthKey]
  );
  const categoryById = useMemo(() => new Map(categories.rows.map((category) => [category.id, category])), [categories.rows]);

  const remainingNegative = summary.remaining < 0;
  const variableTone = progressTone(summary.variableSpent, summary.variableBudget);
  const variableLeft = summary.variableBudget - summary.variableSpent;

  // --- expenses ---------------------------------------------------------

  function openNewExpense(categoryId: string | null = null) {
    setEditingExpense(null);
    setFormCategoryId(categoryId);
    setFormError(null);
    setShowForm(true);
  }

  function openEditExpense(expense: BudgetExpense) {
    setEditingExpense(expense);
    setFormCategoryId(null);
    setFormError(null);
    setShowForm(true);
  }

  async function handleExpenseSubmit(values: ExpenseFormValues) {
    setFormError(null);
    const { error, mappingSaved } = await saveExpense({
      values,
      editingId: editingExpense?.id ?? null,
      categories: categories.rows,
      merchants,
    });
    if (error) {
      setFormError(friendlyErrorMessage(error));
      return;
    }
    if (mappingSaved) refetchMerchants();

    // Jump to the month the expense belongs to so it's visible right away.
    setMonthOffset(monthOffsetFromDate(values.date));
    await refetchExpenses();
    setShowForm(false);
    setEditingExpense(null);
  }

  async function handleDeleteExpense(id: string) {
    setPageError(null);
    const { error } = await supabase.from("expenses").delete().eq("id", id);
    if (error) {
      logSupabaseError("מחיקת הוצאה", error);
      setPageError(friendlyErrorMessage(error));
      return;
    }
    refetchExpenses();
  }

  // --- categories (every amount, name, group is editable) -----------------

  const handleUpdateCategory = useCallback(
    async (id: string, patch: CategoryPatch) => {
      setPageError(null);
      categories.patch(id, patch);
      const { error } = await supabase.from("budget_categories").update(patch).eq("id", id);
      if (error) {
        logSupabaseError("עדכון סעיף תקציב", error);
        setPageError(friendlyErrorMessage(error));
        categories.reset();
        return;
      }
      refetchCategories();
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps -- `categories` is a fresh object each render; its methods only close over setState/serverRows
    [refetchCategories]
  );

  const handleDeleteCategory = useCallback(
    async (id: string) => {
      setPageError(null);
      categories.remove(id);
      // Expenses keep existing (category_id is set null by the FK) -- they just become "ללא קטגוריה".
      const { error } = await supabase.from("budget_categories").delete().eq("id", id);
      if (error) {
        logSupabaseError("מחיקת סעיף תקציב", error);
        setPageError(friendlyErrorMessage(error));
        categories.reset();
        return;
      }
      refetchCategories();
      refetchExpenses();
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps -- see above
    [refetchCategories, refetchExpenses]
  );

  const handleRenameGroup = useCallback(
    async (kind: BudgetKind, oldName: string, newNameRaw: string) => {
      const newName = newNameRaw.trim();
      if (!newName || newName === oldName) return;
      setPageError(null);
      const { error } = await supabase
        .from("budget_categories")
        .update({ group_name: newName })
        .eq("kind", kind)
        .eq("group_name", oldName);
      if (error) {
        logSupabaseError("שינוי שם קבוצה", error);
        setPageError(friendlyErrorMessage(error));
        return;
      }
      refetchCategories();
    },
    [refetchCategories]
  );

  const handleDeleteGroup = useCallback(
    async (kind: BudgetKind, groupName: string) => {
      setPageError(null);
      const { error } = await supabase
        .from("budget_categories")
        .delete()
        .eq("kind", kind)
        .eq("group_name", groupName);
      if (error) {
        logSupabaseError("מחיקת קבוצה", error);
        setPageError(friendlyErrorMessage(error));
        return;
      }
      refetchCategories();
      refetchExpenses();
    },
    [refetchCategories, refetchExpenses]
  );

  const handleAddCategory = useCallback(
    async (kind: BudgetKind, groupName: string, name: string) => {
      setPageError(null);
      const maxOrder = serverCategories.reduce((max, category) => Math.max(max, category.sort_order), 0);
      const { error } = await supabase.from("budget_categories").insert({
        name,
        kind,
        group_name: groupName,
        monthly_budget: 0,
        sort_order: maxOrder + 10,
      });
      if (error) {
        logSupabaseError("הוספת סעיף תקציב", error);
        setPageError(friendlyErrorMessage(error));
        return;
      }
      refetchCategories();
    },
    [serverCategories, refetchCategories]
  );

  // --- store -> category mappings ------------------------------------------

  const reportMerchantError = useCallback((context: string, error: PostgrestError) => {
    logSupabaseError(context, error);
    setPageError(
      error.code === "23505" ? "כבר קיים שיוך לחנות בשם הזה." : friendlyErrorMessage(error)
    );
  }, []);

  const handleAddMerchant = useCallback(
    async (storeName: string, categoryId: string) => {
      setPageError(null);
      const { error } = await upsertMerchant(storeName, categoryId);
      if (error) return reportMerchantError("הוספת שיוך חנות", error);
      refetchMerchants();
    },
    [refetchMerchants, reportMerchantError]
  );

  const handleChangeMerchantCategory = useCallback(
    async (id: string, categoryId: string) => {
      setPageError(null);
      const { error } = await updateMerchant(id, { category_id: categoryId });
      if (error) return reportMerchantError("עדכון שיוך חנות", error);
      refetchMerchants();
    },
    [refetchMerchants, reportMerchantError]
  );

  const handleRenameMerchant = useCallback(
    async (id: string, storeName: string) => {
      setPageError(null);
      const { error } = await updateMerchant(id, { store_name: storeName });
      if (error) return reportMerchantError("שינוי שם חנות", error);
      refetchMerchants();
    },
    [refetchMerchants, reportMerchantError]
  );

  const handleDeleteMerchant = useCallback(
    async (id: string) => {
      setPageError(null);
      const { error } = await deleteMerchant(id);
      if (error) return reportMerchantError("מחיקת שיוך חנות", error);
      refetchMerchants();
    },
    [refetchMerchants, reportMerchantError]
  );

  return (
    <div className="flex min-h-full flex-col">
      <PageHeader title="כלכלת המשפחה" subtitle="תקציב חודשי, הוצאות והכנסות" />

      <div className="flex flex-col gap-4 p-4 pb-28">
        {pageError && <ErrorBanner message={pageError} onDismiss={() => setPageError(null)} />}

        {/* Month switcher */}
        <div className="flex items-center justify-between rounded-2xl border border-amber-100 bg-white p-2 shadow-sm dark:border-amber-950/30 dark:bg-stone-900">
          <button
            type="button"
            onClick={() => setMonthOffset((value) => value - 1)}
            aria-label="חודש קודם"
            className="rounded-full p-2 text-stone-500 transition-colors hover:bg-amber-50 dark:text-stone-400 dark:hover:bg-stone-800"
          >
            <ChevronRight className="h-4 w-4" />
          </button>
          <div className="flex flex-col items-center">
            <span className="text-sm font-semibold text-stone-800 dark:text-stone-100">{formatMonthKey(monthKey)}</span>
            {monthOffset !== 0 && (
              <button
                type="button"
                onClick={() => setMonthOffset(0)}
                className="text-xs text-amber-600 hover:underline dark:text-amber-400"
              >
                החודש הנוכחי
              </button>
            )}
          </div>
          <button
            type="button"
            onClick={() => setMonthOffset((value) => value + 1)}
            aria-label="חודש הבא"
            className="rounded-full p-2 text-stone-500 transition-colors hover:bg-amber-50 dark:text-stone-400 dark:hover:bg-stone-800"
          >
            <ChevronLeft className="h-4 w-4" />
          </button>
        </div>

        {/* Hero: how much is left to live on this month */}
        <div
          className={`flex flex-col gap-3 rounded-3xl border p-5 shadow-sm ${
            remainingNegative
              ? "border-rose-200 bg-rose-50 dark:border-rose-900/40 dark:bg-rose-950/20"
              : "border-emerald-200 bg-emerald-50/70 dark:border-emerald-900/40 dark:bg-emerald-950/20"
          }`}
        >
          <div>
            <p className="text-sm font-medium text-stone-600 dark:text-stone-300">כמה נשאר לנו לחיות החודש</p>
            <p
              className={`mt-1 text-4xl font-extrabold tabular-nums ${
                remainingNegative ? "text-rose-700 dark:text-rose-400" : "text-emerald-700 dark:text-emerald-400"
              }`}
            >
              {formatCurrency(summary.remaining)}
            </p>
            <p className="mt-1 text-xs text-stone-500 dark:text-stone-400">
              הכנסות פחות הוצאות קבועות/חיסכון שמורים פחות מה שכבר הוצאנו בהוצאות המשתנות
            </p>
          </div>

          <div className="grid grid-cols-2 gap-2 text-xs sm:grid-cols-4">
            <div className="rounded-xl bg-white/70 p-2 dark:bg-stone-900/50">
              <p className="text-stone-500 dark:text-stone-400">הכנסות</p>
              <p className="text-sm font-bold tabular-nums text-stone-800 dark:text-stone-100">{formatCurrency(summary.income)}</p>
            </div>
            <div className="rounded-xl bg-white/70 p-2 dark:bg-stone-900/50">
              <p className="text-stone-500 dark:text-stone-400">קבוע + חיסכון</p>
              <p className="text-sm font-bold tabular-nums text-stone-800 dark:text-stone-100">
                {formatCurrency(summary.fixedCommitted + summary.sinkingCommitted)}
              </p>
            </div>
            <div className="rounded-xl bg-white/70 p-2 dark:bg-stone-900/50">
              <p className="text-stone-500 dark:text-stone-400">משתנות עד עכשיו</p>
              <p className="text-sm font-bold tabular-nums text-stone-800 dark:text-stone-100">{formatCurrency(summary.variableSpent)}</p>
            </div>
            <div className="rounded-xl bg-white/70 p-2 dark:bg-stone-900/50">
              <p className="text-stone-500 dark:text-stone-400">סה&quot;כ הוצאנו</p>
              <p className="text-sm font-bold tabular-nums text-stone-800 dark:text-stone-100">{formatCurrency(summary.totalSpent)}</p>
            </div>
          </div>

          {summary.variableBudget > 0 ? (
            <div className="flex flex-col gap-1">
              <div className="flex items-center justify-between text-xs">
                <span className="text-stone-600 dark:text-stone-300">תקציב ההוצאות המשתנות</span>
                <span className={`font-semibold tabular-nums ${TONE_CLASSES[variableTone].text}`}>
                  {variableLeft >= 0
                    ? `נשאר ${formatCurrency(variableLeft)}`
                    : `חריגה של ${formatCurrency(-variableLeft)}`}
                </span>
              </div>
              <div className="h-3 w-full overflow-hidden rounded-full bg-white/80 dark:bg-stone-800">
                <div
                  className={`h-full rounded-full transition-all ${TONE_CLASSES[variableTone].bar}`}
                  style={{ width: `${Math.min(100, Math.round((summary.variableSpent / summary.variableBudget) * 100))}%` }}
                />
              </div>
            </div>
          ) : (
            <p className="text-xs text-stone-500 dark:text-stone-400">
              הגדירו הכנסות ותקציבי יעד במצב עריכה כדי לראות כאן את התמונה המלאה.
            </p>
          )}
        </div>

        <div className="flex items-center justify-between gap-2">
          <h2 className="text-sm font-bold text-stone-700 dark:text-stone-200">תקציב לפי קטגוריות</h2>
          <button
            type="button"
            onClick={() => setManage((value) => !value)}
            className={`flex items-center gap-1 rounded-lg px-2.5 py-1.5 text-xs font-medium transition-colors ${
              manage
                ? "bg-amber-500 text-white hover:bg-amber-600"
                : "border border-amber-200 text-amber-700 hover:bg-amber-50 dark:border-amber-900/50 dark:text-amber-400 dark:hover:bg-stone-800"
            }`}
          >
            {manage ? <Check className="h-3.5 w-3.5" /> : <Pencil className="h-3.5 w-3.5" />}
            {manage ? "סיום עריכה" : "עריכת תקציב וסעיפים"}
          </button>
        </div>

        {categoriesLoading && categories.rows.length === 0 ? (
          <SkeletonList count={4} itemClassName="h-20" />
        ) : categories.rows.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-amber-200 p-8 text-center text-sm text-stone-500 dark:border-amber-900/40 dark:text-stone-400">
            אין עדיין סעיפי תקציב. תבנית הבסיס נטענת עם מיגרציית כלכלת המשפחה (0016) - ודאו שהיא הורצה.
          </div>
        ) : (
          KIND_ORDER.map((kind) => (
            <BudgetKindSection
              key={kind}
              kind={kind}
              categories={categories.rows.filter((category) => category.kind === kind)}
              statuses={summary.statuses}
              manage={manage}
              onAddExpense={openNewExpense}
              onUpdateCategory={handleUpdateCategory}
              onDeleteCategory={handleDeleteCategory}
              onRenameGroup={handleRenameGroup}
              onDeleteGroup={handleDeleteGroup}
              onAddCategory={handleAddCategory}
            />
          ))
        )}

        <StoreMappingsPanel
          merchants={merchants}
          categories={categories.rows}
          onAdd={handleAddMerchant}
          onChangeCategory={handleChangeMerchantCategory}
          onRename={handleRenameMerchant}
          onDelete={handleDeleteMerchant}
        />

        {summary.uncategorizedSpent > 0 && (
          <div className="flex items-center justify-between rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-sm dark:border-amber-900/40 dark:bg-amber-950/20">
            <span className="text-amber-800 dark:text-amber-300">הוצאות ללא קטגוריה (נספרות בהוצאות המשתנות)</span>
            <span className="font-semibold tabular-nums text-amber-800 dark:text-amber-300">
              {formatCurrency(summary.uncategorizedSpent)}
            </span>
          </div>
        )}

        {/* Transactions of the viewed month */}
        <div className="flex flex-col gap-2">
          <h2 className="text-sm font-bold text-stone-700 dark:text-stone-200">
            תנועות החודש{monthExpenses.length > 0 ? ` (${monthExpenses.length})` : ""}
          </h2>
          {monthExpenses.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-amber-200 p-6 text-center text-sm text-stone-500 dark:border-amber-900/40 dark:text-stone-400">
              אין תנועות בחודש הזה. לחצו על + כדי לרשום הוצאה.
            </div>
          ) : (
            <ul className="flex flex-col gap-2">
              {monthExpenses.map((expense) => {
                const category = expense.category_id ? categoryById.get(expense.category_id) : null;
                const isIncome = category?.kind === "income";
                return (
                  <li
                    key={expense.id}
                    className="flex items-start gap-3 rounded-2xl border border-amber-100 bg-white p-3 shadow-sm dark:border-amber-950/30 dark:bg-stone-900"
                  >
                    <span className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-amber-100 text-amber-600 dark:bg-amber-950/50 dark:text-amber-400">
                      <Receipt className="h-4 w-4" />
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium text-stone-800 dark:text-stone-100">
                        {expense.store || expense.title}
                      </p>
                      <p className="text-xs text-stone-500 dark:text-stone-400">
                        {category ? category.name : "ללא קטגוריה"} · {formatDate(expense.date)}
                      </p>
                      {expense.notes && (
                        <p className="mt-0.5 whitespace-pre-wrap text-xs text-stone-500 dark:text-stone-400">{expense.notes}</p>
                      )}
                      {expense.receipt_url && (
                        <a
                          href={expense.receipt_url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="mt-1 inline-flex items-center gap-1 text-xs font-medium text-amber-600 hover:underline dark:text-amber-400"
                        >
                          <ExternalLink className="h-3 w-3" />
                          צפייה בקבלה
                        </a>
                      )}
                    </div>
                    {expense.amount_pending ? (
                      <span className="shrink-0 rounded-full bg-sky-100 px-2.5 py-1 text-xs font-semibold text-sky-700 dark:bg-sky-950/40 dark:text-sky-400">
                        🔍 בבירור
                      </span>
                    ) : (
                      <span
                        className={`shrink-0 text-sm font-semibold tabular-nums ${
                          isIncome ? "text-emerald-700 dark:text-emerald-400" : "text-stone-800 dark:text-stone-100"
                        }`}
                      >
                        {isIncome ? "+" : ""}
                        {formatCurrency(Number(expense.amount))}
                      </span>
                    )}
                    <div className="flex shrink-0 flex-col gap-1">
                      <button
                        type="button"
                        onClick={() => openEditExpense(expense)}
                        aria-label="עריכת הוצאה"
                        className="rounded-full p-1.5 text-stone-400 transition-colors hover:bg-amber-100 hover:text-amber-600 dark:hover:bg-amber-950/40 dark:hover:text-amber-400"
                      >
                        <Pencil className="h-4 w-4" />
                      </button>
                      <button
                        type="button"
                        onClick={() => handleDeleteExpense(expense.id)}
                        aria-label="מחיקה"
                        className="rounded-full p-1.5 text-stone-400 transition-colors hover:bg-red-50 hover:text-red-500 dark:hover:bg-red-950/30"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      </div>

      {/* Zero-friction entry: one tap from anywhere on the screen. */}
      <button
        type="button"
        onClick={() => openNewExpense()}
        aria-label="הוספת הוצאה חדשה"
        className="fixed bottom-20 left-4 z-40 flex items-center gap-1.5 rounded-full bg-amber-500 px-4 py-3 text-sm font-semibold text-white shadow-lg transition-colors hover:bg-amber-600"
      >
        <Plus className="h-5 w-5" />
        הוצאה חדשה
      </button>

      {showForm && (
        <ExpenseFormModal
          editingExpense={editingExpense}
          defaultCategoryId={formCategoryId}
          defaultDate={defaultDateForMonth(monthKey)}
          categories={categories.rows}
          merchants={merchants}
          error={formError}
          onDismissError={() => setFormError(null)}
          onClose={() => {
            setShowForm(false);
            setEditingExpense(null);
            setFormError(null);
          }}
          onSubmit={handleExpenseSubmit}
        />
      )}
    </div>
  );
}

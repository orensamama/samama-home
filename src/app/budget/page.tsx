"use client";

import { useCallback, useMemo, useState } from "react";
import { Check, ChevronLeft, ChevronRight, ExternalLink, Pencil, Plus } from "lucide-react";
import type { PostgrestError } from "@supabase/supabase-js";
import PageHeader from "@/components/PageHeader";
import ErrorBanner from "@/components/ErrorBanner";
import { SkeletonList } from "@/components/Skeleton";
import BudgetKindSection, { type CategoryPatch } from "@/components/BudgetKindSection";
import BudgetSetupBanner from "@/components/BudgetSetupBanner";
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

const TRANSACTIONS_PREVIEW = 8;

export default function BudgetPage() {
  const { categories: categoriesTable, expenses: expensesTable, merchants: merchantsTable, setup } = useBudgetData();
  const { rows: serverCategories, loading: categoriesLoading, refetch: refetchCategories } = categoriesTable;
  const { rows: expenses, refetch: refetchExpenses } = expensesTable;
  const { rows: merchants, refetch: refetchMerchants } = merchantsTable;
  const categories = useOptimisticRows(serverCategories);

  const [monthOffset, setMonthOffset] = useState(0);
  const [manage, setManage] = useState(false);
  const [showAllTransactions, setShowAllTransactions] = useState(false);
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
  const categoryById = useMemo(
    () => new Map(categories.rows.map((category) => [category.id, category])),
    [categories.rows]
  );
  const visibleTransactions = showAllTransactions ? monthExpenses : monthExpenses.slice(0, TRANSACTIONS_PREVIEW);

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
    setFormError(null);
    const { error } = await supabase.from("expenses").delete().eq("id", id);
    if (error) {
      logSupabaseError("מחיקת הוצאה", error);
      setFormError(friendlyErrorMessage(error));
      return;
    }
    await refetchExpenses();
    setShowForm(false);
    setEditingExpense(null);
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
    setPageError(error.code === "23505" ? "כבר קיים שיוך לחנות בשם הזה." : friendlyErrorMessage(error));
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

  const stat = (label: string, value: number) => (
    <div className="px-2 text-center">
      <p className="text-[11px] text-stone-400 dark:text-stone-500">{label}</p>
      <p className="text-sm font-semibold tabular-nums text-stone-800 dark:text-stone-100">{formatCurrency(value)}</p>
    </div>
  );

  return (
    <div className="flex min-h-full flex-col">
      <PageHeader title="כלכלת המשפחה" />

      <div className="flex flex-col gap-4 p-4 pb-28">
        {pageError && <ErrorBanner message={pageError} onDismiss={() => setPageError(null)} />}
        <BudgetSetupBanner setup={setup} />

        {/* Summary: month switcher + what's left to live on */}
        <div className="rounded-2xl border border-amber-100 bg-white p-4 shadow-sm dark:border-amber-950/30 dark:bg-stone-900">
          <div className="flex items-center justify-between">
            <button
              type="button"
              onClick={() => setMonthOffset((value) => value - 1)}
              aria-label="חודש קודם"
              className="rounded-full p-1.5 text-stone-400 transition-colors hover:bg-amber-50 dark:hover:bg-stone-800"
            >
              <ChevronRight className="h-4 w-4" />
            </button>
            <div className="flex flex-col items-center">
              <span className="text-sm font-semibold text-stone-700 dark:text-stone-200">{formatMonthKey(monthKey)}</span>
              {monthOffset !== 0 && (
                <button
                  type="button"
                  onClick={() => setMonthOffset(0)}
                  className="text-[11px] text-amber-600 hover:underline dark:text-amber-400"
                >
                  החודש הנוכחי
                </button>
              )}
            </div>
            <button
              type="button"
              onClick={() => setMonthOffset((value) => value + 1)}
              aria-label="חודש הבא"
              className="rounded-full p-1.5 text-stone-400 transition-colors hover:bg-amber-50 dark:hover:bg-stone-800"
            >
              <ChevronLeft className="h-4 w-4" />
            </button>
          </div>

          <div className="mt-3 text-center">
            <p className="text-xs text-stone-400 dark:text-stone-500">יתרת תקציב פנויה</p>
            <p
              className={`text-4xl font-bold tabular-nums ${
                remainingNegative ? "text-rose-600 dark:text-rose-400" : "text-emerald-700 dark:text-emerald-400"
              }`}
            >
              {formatCurrency(summary.remaining)}
            </p>
          </div>

          {summary.variableBudget > 0 && (
            <div className="mt-3 flex flex-col gap-1">
              <div className="h-1.5 w-full overflow-hidden rounded-full bg-stone-100 dark:bg-stone-800">
                <div
                  className={`h-full rounded-full transition-all ${TONE_CLASSES[variableTone].bar}`}
                  style={{ width: `${Math.min(100, Math.round((summary.variableSpent / summary.variableBudget) * 100))}%` }}
                />
              </div>
              <p className={`text-center text-[11px] font-medium ${TONE_CLASSES[variableTone].text}`}>
                {variableLeft >= 0
                  ? `נשאר ${formatCurrency(variableLeft)} בתקציב המשתנות`
                  : `חריגה של ${formatCurrency(-variableLeft)} בתקציב המשתנות`}
              </p>
            </div>
          )}

          <div className="mt-3 grid grid-cols-3 divide-x divide-stone-100 border-t border-stone-100 pt-3 dark:divide-stone-800 dark:border-stone-800">
            {stat("הכנסות", summary.income)}
            {stat("קבוע וחיסכון", summary.fixedCommitted + summary.sinkingCommitted)}
            {stat("משתנות", summary.variableSpent)}
          </div>
        </div>

        {/* Budget by category */}
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-bold text-stone-700 dark:text-stone-200">תקציב</h2>
          <button
            type="button"
            onClick={() => setManage((value) => !value)}
            className={`flex items-center gap-1 rounded-lg px-2.5 py-1 text-xs font-medium transition-colors ${
              manage
                ? "bg-amber-500 text-white hover:bg-amber-600"
                : "text-amber-700 hover:bg-amber-50 dark:text-amber-400 dark:hover:bg-stone-800"
            }`}
          >
            {manage ? <Check className="h-3.5 w-3.5" /> : <Pencil className="h-3.5 w-3.5" />}
            {manage ? "סיום" : "עריכת תקציב"}
          </button>
        </div>

        {categoriesLoading && categories.rows.length === 0 ? (
          <SkeletonList count={4} itemClassName="h-12" />
        ) : categories.rows.length === 0 ? (
          setup.checking || setup.issues.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-amber-200 p-6 text-center text-sm text-stone-500 dark:border-amber-900/40 dark:text-stone-400">
              טוען את סעיפי התקציב...
            </div>
          ) : null
        ) : (
          KIND_ORDER.map((kind) => (
            <BudgetKindSection
              key={kind}
              kind={kind}
              defaultOpen={kind === "variable"}
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

        {summary.uncategorizedSpent > 0 && (
          <div className="flex items-center justify-between rounded-xl bg-amber-50 px-3 py-2 text-sm dark:bg-amber-950/20">
            <span className="text-amber-800 dark:text-amber-300">הוצאות ללא קטגוריה</span>
            <span className="font-semibold tabular-nums text-amber-800 dark:text-amber-300">
              {formatCurrency(summary.uncategorizedSpent)}
            </span>
          </div>
        )}

        <StoreMappingsPanel
          merchants={merchants}
          categories={categories.rows}
          onAdd={handleAddMerchant}
          onChangeCategory={handleChangeMerchantCategory}
          onRename={handleRenameMerchant}
          onDelete={handleDeleteMerchant}
        />

        {/* Transactions of the viewed month: tap one to edit or delete it */}
        <div className="flex flex-col gap-2">
          <h2 className="text-sm font-bold text-stone-700 dark:text-stone-200">
            תנועות{monthExpenses.length > 0 ? ` (${monthExpenses.length})` : ""}
          </h2>
          {monthExpenses.length === 0 ? (
            <p className="rounded-2xl border border-dashed border-amber-200 p-5 text-center text-sm text-stone-400 dark:border-amber-900/40 dark:text-stone-500">
              אין תנועות החודש
            </p>
          ) : (
            <ul className="divide-y divide-stone-100 overflow-hidden rounded-2xl border border-amber-100 bg-white dark:divide-stone-800 dark:border-amber-950/30 dark:bg-stone-900">
              {visibleTransactions.map((expense) => {
                const category = expense.category_id ? categoryById.get(expense.category_id) : null;
                const isIncome = category?.kind === "income";
                return (
                  <li key={expense.id}>
                    <button
                      type="button"
                      onClick={() => openEditExpense(expense)}
                      className="flex w-full items-center gap-3 px-4 py-2.5 text-right transition-colors hover:bg-amber-50/60 dark:hover:bg-stone-800/60"
                    >
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm text-stone-800 dark:text-stone-100">
                          {expense.store || expense.title}
                        </span>
                        <span className="block truncate text-[11px] text-stone-400 dark:text-stone-500">
                          {category ? category.name : "ללא קטגוריה"} · {formatDate(expense.date)}
                        </span>
                      </span>
                      {expense.receipt_url && (
                        <ExternalLink className="h-3.5 w-3.5 shrink-0 text-stone-300" aria-label="יש קבלה" />
                      )}
                      {expense.amount_pending ? (
                        <span className="shrink-0 rounded-full bg-sky-100 px-2 py-0.5 text-[11px] font-semibold text-sky-700 dark:bg-sky-950/40 dark:text-sky-400">
                          בבירור
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
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
          {monthExpenses.length > TRANSACTIONS_PREVIEW && (
            <button
              type="button"
              onClick={() => setShowAllTransactions((value) => !value)}
              className="w-fit self-center text-xs font-medium text-amber-600 hover:underline dark:text-amber-400"
            >
              {showAllTransactions ? "הצג פחות" : `הצג את כל ${monthExpenses.length} התנועות`}
            </button>
          )}
        </div>
      </div>

      {/* One tap from anywhere on the screen. */}
      <button
        type="button"
        onClick={() => openNewExpense()}
        aria-label="הוספת הוצאה חדשה"
        className="fixed bottom-20 left-4 z-40 flex items-center gap-1 rounded-full bg-amber-500 px-4 py-2.5 text-sm font-semibold text-white shadow-lg transition-colors hover:bg-amber-600 active:scale-95"
      >
        <Plus className="h-4 w-4" />
        הוצאה
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
          onDelete={editingExpense ? () => handleDeleteExpense(editingExpense.id) : undefined}
        />
      )}
    </div>
  );
}

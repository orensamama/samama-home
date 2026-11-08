"use client";

import { useMemo, useRef, useState, type ChangeEvent } from "react";
import { FileUp, Loader2, X } from "lucide-react";
import CategorySelect from "@/components/CategorySelect";
import ErrorBanner from "@/components/ErrorBanner";
import { importExpenses } from "@/lib/budgetActions";
import { friendlyErrorMessage } from "@/lib/supabaseErrors";
import { formatCurrency, formatDate } from "@/lib/familyData";
import { suggestExpenseCategoryId } from "@/lib/statementCategorize";
import { STATEMENT_ACCEPT, readStatementFile } from "@/lib/statementFiles";
import { findDuplicates, parseStatementText, type ParsedTransaction } from "@/lib/statementParse";
import type { BudgetCategory, BudgetExpense, MerchantCategory } from "@/lib/budgetData";

type ReviewRow = ParsedTransaction & {
  key: number;
  categoryId: string;
  selected: boolean;
  duplicate: boolean;
};

/**
 * "ייבוא תנועות": a credit-card / bank file (CSV, Excel, PDF) or a pasted text (an SMS, lines from the
 * card app) is read, every line gets a suggested category and the user reviews them once before saving.
 */
export default function ImportTransactionsPanel({
  categories,
  merchants,
  expenses,
  onClose,
  onImported,
}: {
  categories: BudgetCategory[];
  merchants: MerchantCategory[];
  expenses: BudgetExpense[];
  onClose: () => void;
  onImported: (result: { inserted: number; learned: number; latestDate: string | null }) => void;
}) {
  const fileInput = useRef<HTMLInputElement>(null);
  const [pasted, setPasted] = useState("");
  const [rows, setRows] = useState<ReviewRow[] | null>(null);
  const [fileName, setFileName] = useState("");
  const [busy, setBusy] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const expenseCategories = useMemo(() => categories.filter((category) => category.kind !== "income"), [categories]);
  const incomeCategories = useMemo(() => categories.filter((category) => category.kind === "income"), [categories]);

  function review(parsed: ParsedTransaction[]) {
    if (parsed.length === 0) {
      setRows(null);
      setError("לא זיהינו תנועות. ודאו שיש בקובץ או בטקסט תאריך וסכום, או הדביקו שורות מאפליקציית האשראי.");
      return;
    }
    const duplicates = findDuplicates(
      parsed,
      expenses.filter((expense) => !expense.amount_pending).map((expense) => ({ date: expense.date, amount: Number(expense.amount) || 0 }))
    );
    setError(null);
    setRows(
      parsed.map((entry, index) => ({
        ...entry,
        key: index,
        categoryId: entry.direction === "expense" ? suggestExpenseCategoryId(entry.merchant, merchants, categories) : "",
        duplicate: duplicates[index],
        selected: entry.direction === "expense" && !duplicates[index],
      }))
    );
  }

  async function handleFile(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    setBusy(true);
    setError(null);
    setFileName(file.name);
    try {
      review(await readStatementFile(file));
    } catch (caught) {
      setRows(null);
      setError(caught instanceof Error ? caught.message : "לא הצלחנו לקרוא את הקובץ.");
    } finally {
      setBusy(false);
    }
  }

  function handlePaste() {
    setFileName("");
    review(parseStatementText(pasted));
  }

  function patchRow(key: number, patch: Partial<ReviewRow>) {
    setRows((current) => current?.map((row) => (row.key === key ? { ...row, ...patch } : row)) ?? null);
  }

  const importable = rows?.filter((row) => row.selected && (row.direction === "expense" || row.categoryId)) ?? [];
  const importableTotal = importable.reduce((sum, row) => sum + (row.direction === "expense" ? row.amount : 0), 0);
  const allSelected = rows !== null && rows.length > 0 && rows.every((row) => row.selected);

  async function handleImport() {
    if (importable.length === 0) return;
    setSaving(true);
    setError(null);
    const result = await importExpenses({
      rows: importable.map((row) => ({ date: row.date, store: row.merchant, amount: row.amount, categoryId: row.categoryId })),
      categories,
      merchants,
    });
    setSaving(false);
    if (result.error) {
      setError(
        result.inserted > 0
          ? `נשמרו ${result.inserted} תנועות לפני שהתרחשה שגיאה: ${friendlyErrorMessage(result.error)}`
          : friendlyErrorMessage(result.error)
      );
      if (result.inserted > 0) onImported({ inserted: result.inserted, learned: result.learned, latestDate: null });
      return;
    }
    const latestDate = importable.reduce((latest, row) => (row.date > latest ? row.date : latest), "");
    onImported({ inserted: result.inserted, learned: result.learned, latestDate: latestDate || null });
  }

  return (
    <div className="fixed inset-0 z-[60] flex items-end justify-center bg-black/40 sm:items-center">
      <div
        role="dialog"
        aria-modal="true"
        aria-label="ייבוא תנועות"
        className="flex max-h-[92dvh] w-full flex-col overflow-hidden rounded-t-3xl bg-white shadow-lg sm:max-w-lg sm:rounded-3xl dark:bg-stone-900"
      >
        <div className="flex shrink-0 items-center justify-between border-b border-amber-100 p-4 dark:border-amber-950/30">
          <h2 className="text-lg font-bold text-stone-800 dark:text-stone-100">ייבוא תנועות</h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="סגירה"
            className="rounded-full p-1.5 text-stone-400 hover:bg-stone-100 dark:hover:bg-stone-800"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto p-4">
          {error && <ErrorBanner message={error} onDismiss={() => setError(null)} />}

          {rows === null ? (
            <>
              <div className="flex flex-col gap-2 rounded-2xl border border-amber-100 p-3 dark:border-amber-950/30">
                <p className="text-sm font-semibold text-stone-800 dark:text-stone-100">קובץ מהבנק או מחברת האשראי</p>
                <p className="text-xs text-stone-500 dark:text-stone-400">CSV, Excel (xlsx) או PDF. כל התנועות נקראות ומסווגות, ואתם בודקים לפני השמירה.</p>
                <input ref={fileInput} type="file" accept={STATEMENT_ACCEPT} onChange={handleFile} className="sr-only" aria-label="בחירת קובץ" />
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => fileInput.current?.click()}
                  className="flex items-center justify-center gap-2 rounded-xl bg-amber-500 py-3 text-sm font-semibold text-white hover:bg-amber-600 disabled:opacity-60"
                >
                  {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <FileUp className="h-4 w-4" />}
                  {busy ? "קורא את הקובץ..." : "בחירת קובץ"}
                </button>
              </div>

              <div className="flex flex-col gap-2 rounded-2xl border border-amber-100 p-3 dark:border-amber-950/30">
                <label htmlFor="import-paste" className="text-sm font-semibold text-stone-800 dark:text-stone-100">
                  או הדבקת טקסט
                </label>
                <p className="text-xs text-stone-500 dark:text-stone-400">הודעת SMS מחברת האשראי, או שורות שהועתקו מהאפליקציה. מזהים סכום, בית עסק ותאריך.</p>
                <textarea
                  id="import-paste"
                  value={pasted}
                  onChange={(event) => setPasted(event.target.value)}
                  rows={4}
                  placeholder={'בוצעה עסקה בכרטיסך בסך 150.00 ש"ח בבית העסק רמי לוי בתאריך 05/11/26'}
                  className="w-full rounded-xl border border-amber-200 bg-white p-2.5 text-sm text-stone-800 outline-none focus:border-amber-400 dark:border-amber-900/50 dark:bg-stone-950 dark:text-stone-100"
                />
                <button
                  type="button"
                  disabled={!pasted.trim()}
                  onClick={handlePaste}
                  className="rounded-xl border border-amber-300 py-2.5 text-sm font-semibold text-amber-700 hover:bg-amber-50 disabled:opacity-50 dark:border-amber-800 dark:text-amber-400 dark:hover:bg-stone-800"
                >
                  זיהוי תנועות
                </button>
              </div>
            </>
          ) : (
            <>
              <div className="flex items-center justify-between gap-2 text-xs text-stone-500 dark:text-stone-400">
                <span>
                  נמצאו {rows.length} תנועות{fileName ? ` ב-${fileName}` : ""}
                </span>
                <span className="flex items-center gap-3">
                  <button
                    type="button"
                    onClick={() => setRows((current) => current?.map((row) => ({ ...row, selected: !allSelected && (row.direction === "expense" || row.categoryId !== "") })) ?? null)}
                    className="font-medium text-amber-700 dark:text-amber-400"
                  >
                    {allSelected ? "ניקוי בחירה" : "בחירת הכול"}
                  </button>
                  <button type="button" onClick={() => setRows(null)} className="font-medium text-stone-500 underline">
                    חזרה
                  </button>
                </span>
              </div>

              <ul className="flex flex-col gap-2">
                {rows.map((row) => {
                  const isCredit = row.direction === "credit";
                  return (
                    <li
                      key={row.key}
                      className={`flex flex-col gap-1.5 rounded-xl border p-2.5 ${
                        row.selected ? "border-amber-300 bg-amber-50/50 dark:border-amber-800 dark:bg-amber-950/10" : "border-stone-200 dark:border-stone-800"
                      }`}
                    >
                      <div className="flex items-center gap-2">
                        <input
                          type="checkbox"
                          checked={row.selected}
                          disabled={isCredit && !row.categoryId}
                          onChange={(event) => patchRow(row.key, { selected: event.target.checked })}
                          aria-label={`ייבוא ${row.merchant}`}
                          className="h-5 w-5 shrink-0 accent-amber-500"
                        />
                        <span className="text-xs text-stone-500 dark:text-stone-400">{formatDate(row.date)}</span>
                        {row.duplicate && (
                          <span className="rounded-full bg-sky-100 px-2 py-0.5 text-[10px] font-medium text-sky-700 dark:bg-sky-950/40 dark:text-sky-300">
                            כבר קיימת?
                          </span>
                        )}
                        {isCredit && (
                          <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-medium text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300">
                            זיכוי / הכנסה
                          </span>
                        )}
                        <span className="ms-auto text-sm font-bold tabular-nums text-stone-800 dark:text-stone-100">{formatCurrency(row.amount)}</span>
                      </div>
                      <div className="grid grid-cols-2 gap-2">
                        <input
                          type="text"
                          value={row.merchant}
                          onChange={(event) => patchRow(row.key, { merchant: event.target.value })}
                          aria-label="בית עסק"
                          className="w-full rounded-lg border border-amber-200 bg-white px-2 py-1.5 text-sm text-stone-800 outline-none focus:border-amber-400 dark:border-amber-900/50 dark:bg-stone-950 dark:text-stone-100"
                        />
                        <CategorySelect
                          categories={isCredit ? incomeCategories : expenseCategories}
                          value={row.categoryId}
                          onChange={(categoryId) => patchRow(row.key, { categoryId, ...(isCredit ? { selected: categoryId !== "" } : {}) })}
                          emptyLabel={isCredit ? "בחירת מקור הכנסה" : "ללא קטגוריה"}
                          ariaLabel="קטגוריה"
                          className="w-full rounded-lg border border-amber-200 bg-white px-2 py-1.5 text-sm text-stone-700 dark:border-amber-900/50 dark:bg-stone-950 dark:text-stone-200"
                        />
                      </div>
                    </li>
                  );
                })}
              </ul>
              <p className="text-[11px] text-stone-400">
                תנועות עם התג ״כבר קיימת?״ זהות ליום וסכום שכבר רשומים ולכן לא מסומנות. זיכויים מיובאים רק אם בחרתם להם מקור הכנסה.
              </p>
            </>
          )}
        </div>

        {rows !== null && (
          <div className="shrink-0 border-t border-amber-100 p-4 dark:border-amber-950/30">
            <button
              type="button"
              disabled={importable.length === 0 || saving}
              onClick={handleImport}
              className="flex w-full items-center justify-center gap-2 rounded-xl bg-amber-500 py-3 text-sm font-bold text-white hover:bg-amber-600 disabled:opacity-50"
            >
              {saving && <Loader2 className="h-4 w-4 animate-spin" />}
              {saving
                ? "שומר..."
                : importable.length === 0
                  ? "לא נבחרו תנועות"
                  : `ייבוא ${importable.length} תנועות${importableTotal > 0 ? ` · ${formatCurrency(importableTotal)}` : ""}`}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

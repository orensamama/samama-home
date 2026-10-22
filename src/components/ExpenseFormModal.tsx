"use client";

import { useMemo, useState, type ChangeEvent, type FormEvent } from "react";
import { Camera, ScanLine, Sparkles, X } from "lucide-react";
import ErrorBanner from "@/components/ErrorBanner";
import { supabase } from "@/lib/supabaseClient";
import {
  KIND_META,
  KIND_ORDER,
  parseReceiptText,
  suggestMerchant,
  type BudgetCategory,
  type BudgetExpense,
  type MerchantCategory,
} from "@/lib/budgetData";

const MAX_IMAGE_BYTES = 5 * 1024 * 1024;

export type ExpenseFormValues = {
  amount: string;
  amount_pending: boolean;
  store: string;
  category_id: string; // "" = no category
  date: string;
  notes: string;
  receipt_url: string;
};

export default function ExpenseFormModal({
  editingExpense,
  defaultCategoryId,
  defaultDate,
  categories,
  merchants,
  error,
  onDismissError,
  onClose,
  onSubmit,
}: {
  editingExpense: BudgetExpense | null | undefined;
  defaultCategoryId?: string | null;
  defaultDate: string;
  categories: BudgetCategory[];
  merchants: MerchantCategory[];
  error?: string | null;
  onDismissError: () => void;
  onClose: () => void;
  onSubmit: (values: ExpenseFormValues) => Promise<void>;
}) {
  const [values, setValues] = useState<ExpenseFormValues>(() =>
    editingExpense
      ? {
          amount: editingExpense.amount_pending ? "" : String(editingExpense.amount),
          amount_pending: editingExpense.amount_pending,
          store: editingExpense.store ?? "",
          category_id: editingExpense.category_id ?? "",
          date: editingExpense.date,
          notes: editingExpense.notes ?? "",
          receipt_url: editingExpense.receipt_url ?? "",
        }
      : {
          amount: "",
          amount_pending: false,
          store: "",
          category_id: defaultCategoryId ?? "",
          date: defaultDate,
          notes: "",
          receipt_url: "",
        }
  );
  // Until the user picks a category themselves, the remembered one for the
  // typed store name is used; picking one (even "none") overrides it.
  const [categoryTouched, setCategoryTouched] = useState(Boolean(editingExpense) || Boolean(defaultCategoryId));
  const [submitting, setSubmitting] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [scanning, setScanning] = useState(false);
  const [scanMessage, setScanMessage] = useState<string | null>(null);
  const [receiptFile, setReceiptFile] = useState<File | null>(null);

  const suggestion = useMemo(() => suggestMerchant(values.store, merchants), [values.store, merchants]);
  const suggestedCategory = suggestion
    ? (categories.find((category) => category.id === suggestion.category_id) ?? null)
    : null;
  const effectiveCategoryId = categoryTouched ? values.category_id : (suggestedCategory?.id ?? values.category_id);
  const showingSuggestion = !categoryTouched && suggestedCategory !== null;

  const groupedOptions = useMemo(
    () =>
      KIND_ORDER.map((kind) => {
        const ofKind = categories.filter((category) => category.kind === kind);
        const groups = Array.from(new Set(ofKind.map((category) => category.group_name)));
        return {
          kind,
          groups: groups.map((group) => ({
            group,
            items: ofKind.filter((category) => category.group_name === group),
          })),
        };
      }).filter((entry) => entry.groups.length > 0),
    [categories]
  );

  const parsedAmount = Number(values.amount);
  const isValid =
    values.date &&
    (values.amount_pending || (values.amount !== "" && !Number.isNaN(parsedAmount) && parsedAmount > 0));

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    if (!isValid || submitting) return;
    setSubmitting(true);
    await onSubmit({ ...values, category_id: effectiveCategoryId });
    setSubmitting(false);
  }

  async function handleReceiptChange(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    if (file.size > MAX_IMAGE_BYTES) {
      setUploadError("התמונה גדולה מדי (מקסימום 5MB)");
      return;
    }
    setReceiptFile(file);
    setScanMessage(null);
    setUploading(true);
    setUploadError(null);
    const path = `${crypto.randomUUID()}-${file.name.replace(/[^\w.-]/g, "_")}`;
    const { error: err } = await supabase.storage.from("receipt-images").upload(path, file);
    if (err) {
      console.error("[Supabase] העלאת קבלה:", err.message, err);
      setUploadError("העלאת הקבלה נכשלה. ודאו שמיגרציית 0016 (כלכלת המשפחה) הורצה.");
      setUploading(false);
      return;
    }
    const { data } = supabase.storage.from("receipt-images").getPublicUrl(path);
    setValues((v) => ({ ...v, receipt_url: data.publicUrl }));
    setUploading(false);
  }

  // First-pass OCR, entirely in the browser (tesseract.js, loaded only when
  // asked): pulls out the total, store name and date to pre-fill the form.
  async function handleScan() {
    const file = receiptFile;
    if (!file || scanning) return;
    setScanning(true);
    setScanMessage("סורק את הקבלה... (בפעם הראשונה ההורדה של מנוע הזיהוי לוקחת רגע)");
    try {
      const { createWorker } = await import("tesseract.js");
      const worker = await createWorker("heb+eng");
      const { data } = await worker.recognize(file);
      await worker.terminate();
      const parsed = parseReceiptText(data.text);

      const found: string[] = [];
      setValues((v) => {
        const next = { ...v };
        if (parsed.amount !== null && (v.amount === "" || Number(v.amount) === 0)) next.amount = String(parsed.amount);
        if (parsed.store && !v.store.trim()) next.store = parsed.store;
        if (parsed.date) next.date = parsed.date;
        return next;
      });
      if (parsed.amount !== null) found.push(`סכום ${parsed.amount}`);
      if (parsed.store) found.push(`חנות "${parsed.store}"`);
      if (parsed.date) found.push(`תאריך ${parsed.date}`);
      setScanMessage(
        found.length > 0
          ? `זוהה: ${found.join(" · ")}. כדאי לוודא שהפרטים נכונים.`
          : "לא הצלחנו לזהות פרטים בקבלה - אפשר למלא ידנית."
      );
    } catch (err) {
      console.error("[OCR] סריקת קבלה:", err);
      setScanMessage("הסריקה נכשלה (ייתכן שאין חיבור לאינטרנט). אפשר למלא ידנית.");
    } finally {
      setScanning(false);
    }
  }

  const fieldClass =
    "w-full rounded-xl border border-amber-200 bg-white px-3 py-2 text-sm text-stone-700 outline-none focus:border-amber-400 dark:border-amber-900/50 dark:bg-stone-950 dark:text-stone-200";

  return (
    <div className="fixed inset-0 z-[60] flex items-end justify-center bg-black/40 sm:items-center">
      <div className="flex max-h-[90dvh] w-full flex-col overflow-hidden rounded-t-3xl bg-white shadow-lg sm:max-w-md sm:rounded-3xl dark:bg-stone-900">
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
              <p className="mb-1.5 text-xs font-medium text-stone-500 dark:text-stone-400">סכום (₪)</p>
              <input
                type="number"
                inputMode="decimal"
                step="0.01"
                min="0"
                autoFocus
                value={values.amount}
                disabled={values.amount_pending}
                onChange={(event) => setValues((v) => ({ ...v, amount: event.target.value }))}
                placeholder="0.00"
                className={`${fieldClass} text-lg font-semibold disabled:opacity-40`}
              />
              <label className="mt-1.5 flex w-fit cursor-pointer items-center gap-1.5 text-xs text-stone-500 dark:text-stone-400">
                <input
                  type="checkbox"
                  checked={values.amount_pending}
                  onChange={(event) => setValues((v) => ({ ...v, amount_pending: event.target.checked }))}
                />
                הסכום עדיין בבירור
              </label>
            </div>

            <div>
              <p className="mb-1.5 text-xs font-medium text-stone-500 dark:text-stone-400">שם החנות / בית העסק</p>
              <input
                type="text"
                list="expense-store-suggestions"
                value={values.store}
                onChange={(event) => setValues((v) => ({ ...v, store: event.target.value }))}
                placeholder="לדוגמה: רמי לוי"
                className={fieldClass}
              />
              <datalist id="expense-store-suggestions">
                {merchants.map((merchant) => (
                  <option key={merchant.id} value={merchant.store_name} />
                ))}
              </datalist>
            </div>

            <div>
              <p className="mb-1.5 text-xs font-medium text-stone-500 dark:text-stone-400">קטגוריה</p>
              <select
                value={effectiveCategoryId}
                onChange={(event) => {
                  setCategoryTouched(true);
                  setValues((v) => ({ ...v, category_id: event.target.value }));
                }}
                className={fieldClass}
              >
                <option value="">ללא קטגוריה</option>
                {groupedOptions.map(({ kind, groups }) =>
                  groups.map(({ group, items }) => (
                    <optgroup key={`${kind}-${group}`} label={`${KIND_META[kind].label.split(" (")[0]} · ${group}`}>
                      {items.map((category) => (
                        <option key={category.id} value={category.id}>
                          {category.name}
                        </option>
                      ))}
                    </optgroup>
                  ))
                )}
              </select>
              {showingSuggestion && (
                <p className="mt-1 flex items-center gap-1 text-xs text-emerald-700 dark:text-emerald-400">
                  <Sparkles className="h-3 w-3" />
                  החנות מוכרת - קטגוריה: {suggestedCategory?.name}. אפשר לשנות, ונזכור את הבחירה לפעם הבאה.
                </p>
              )}
            </div>

            <div>
              <p className="mb-1.5 text-xs font-medium text-stone-500 dark:text-stone-400">תאריך</p>
              <input
                type="date"
                value={values.date}
                onChange={(event) => setValues((v) => ({ ...v, date: event.target.value }))}
                className={fieldClass}
              />
            </div>

            <div>
              <p className="mb-1.5 text-xs font-medium text-stone-500 dark:text-stone-400">הערות (לא חובה)</p>
              <textarea
                value={values.notes}
                onChange={(event) => setValues((v) => ({ ...v, notes: event.target.value }))}
                rows={2}
                placeholder="פירוט נוסף..."
                className={`${fieldClass} resize-none`}
              />
            </div>

            <div>
              <p className="mb-1.5 text-xs font-medium text-stone-500 dark:text-stone-400">קבלה (לא חובה)</p>
              {values.receipt_url ? (
                <div className="flex items-start gap-3">
                  <div className="relative w-fit">
                    {/* eslint-disable-next-line @next/next/no-img-element -- user-uploaded, arbitrary Supabase storage URL */}
                    <img
                      src={values.receipt_url}
                      alt="קבלה"
                      className="h-24 w-24 rounded-xl border border-amber-200 object-cover dark:border-amber-900/50"
                    />
                    <button
                      type="button"
                      onClick={() => {
                        setReceiptFile(null);
                        setScanMessage(null);
                        setValues((v) => ({ ...v, receipt_url: "" }));
                      }}
                      aria-label="הסרת קבלה"
                      className="absolute -right-2 -top-2 rounded-full bg-stone-800 p-1 text-white shadow"
                    >
                      <X className="h-3 w-3" />
                    </button>
                  </div>
                  {receiptFile && (
                    <button
                      type="button"
                      onClick={handleScan}
                      disabled={scanning}
                      className="flex items-center gap-1.5 rounded-xl border border-amber-300 px-3 py-2 text-sm font-medium text-amber-700 transition-colors hover:bg-amber-50 disabled:opacity-50 dark:border-amber-800 dark:text-amber-400 dark:hover:bg-stone-800"
                    >
                      <ScanLine className="h-4 w-4" />
                      {scanning ? "סורק..." : "מלא אוטומטית מהקבלה"}
                    </button>
                  )}
                </div>
              ) : (
                <label className="flex w-fit cursor-pointer items-center gap-2 rounded-xl border border-dashed border-amber-300 px-3 py-2 text-sm text-amber-700 transition-colors hover:bg-amber-50 dark:border-amber-800 dark:text-amber-400 dark:hover:bg-stone-800">
                  <Camera className="h-4 w-4" />
                  {uploading ? "מעלה קבלה..." : "צילום / העלאת קבלה"}
                  <input
                    type="file"
                    accept="image/*"
                    capture="environment"
                    className="hidden"
                    disabled={uploading}
                    onChange={handleReceiptChange}
                  />
                </label>
              )}
              {uploadError && <p className="mt-1 text-xs text-rose-600 dark:text-rose-400">{uploadError}</p>}
              {scanMessage && <p className="mt-1.5 text-xs text-stone-600 dark:text-stone-300">{scanMessage}</p>}
            </div>
          </div>

          <div className="shrink-0 border-t border-amber-100 bg-white p-4 dark:border-amber-950/30 dark:bg-stone-900">
            <button
              type="submit"
              disabled={!isValid || submitting}
              className="w-full rounded-xl bg-amber-500 px-4 py-3 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-amber-600 disabled:opacity-50"
            >
              {editingExpense ? "שמירת שינויים" : "שמירת הוצאה"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

"use client";

import { useEffect, useMemo, useRef, useState, type ChangeEvent, type FormEvent } from "react";
import { Camera, Image as ImageIcon, Mic, ScanLine, Sparkles, Trash2, X } from "lucide-react";
import ErrorBanner from "@/components/ErrorBanner";
import CategorySelect from "@/components/CategorySelect";
import { supabase } from "@/lib/supabaseClient";
import { categoryNameForText, parseSpokenExpense } from "@/lib/spokenExpense";
import {
  formatReceiptItems,
  parseReceiptText,
  suggestMerchant,
  type BudgetCategory,
  type BudgetExpense,
  type ExpenseFormValues,
  type MerchantCategory,
} from "@/lib/budgetData";

export type { ExpenseFormValues };

const MAX_IMAGE_BYTES = 5 * 1024 * 1024;
const OCR_MAX_SIDE = 2000;

// The Web Speech API isn't in TypeScript's DOM lib; only what we use is declared.
type SpeechRecognitionResultLike = { isFinal: boolean; 0: { transcript: string } };
type SpeechRecognitionLike = {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  onresult: ((event: { results: ArrayLike<SpeechRecognitionResultLike> }) => void) | null;
  onerror: ((event: { error: string }) => void) | null;
  onend: (() => void) | null;
  start: () => void;
  stop: () => void;
  abort: () => void;
};
type SpeechRecognitionCtor = new () => SpeechRecognitionLike;

function getSpeechRecognition(): SpeechRecognitionCtor | null {
  const w = window as unknown as { SpeechRecognition?: SpeechRecognitionCtor; webkitSpeechRecognition?: SpeechRecognitionCtor };
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null;
}

const SPEECH_ERRORS: Record<string, string> = {
  "not-allowed": "אין הרשאת מיקרופון. אפשרו גישה למיקרופון בהגדרות הדפדפן ונסו שוב.",
  "service-not-allowed": "אין הרשאת מיקרופון. אפשרו גישה למיקרופון בהגדרות הדפדפן ונסו שוב.",
  "no-speech": "לא שמענו כלום. לחצו שוב ודברו קרוב למכשיר.",
  "audio-capture": "לא נמצא מיקרופון במכשיר.",
  network: "זיהוי הדיבור דורש חיבור לאינטרנט.",
};

/**
 * Phone photos are huge and noisy; a downscaled grayscale, higher-contrast
 * copy is both much faster to scan and usually reads better. Falls back to
 * the original file if the browser can't do it.
 */
async function prepareForOcr(file: File): Promise<Blob> {
  try {
    const bitmap = await createImageBitmap(file);
    const scale = Math.min(1, OCR_MAX_SIDE / Math.max(bitmap.width, bitmap.height));
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(bitmap.width * scale);
    canvas.height = Math.round(bitmap.height * scale);
    const context = canvas.getContext("2d");
    if (!context) return file;
    context.filter = "grayscale(1) contrast(1.35)";
    context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    bitmap.close();
    return await new Promise<Blob>((resolve) => canvas.toBlob((blob) => resolve(blob ?? file), "image/png"));
  } catch {
    return file;
  }
}

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
  onDelete,
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
  /** When given (editing), a delete button is shown in the form footer. */
  onDelete?: () => Promise<void> | void;
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
          remember_mapping: true,
        }
      : {
          amount: "",
          amount_pending: false,
          store: "",
          category_id: defaultCategoryId ?? "",
          date: defaultDate,
          notes: "",
          receipt_url: "",
          remember_mapping: true,
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
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [listening, setListening] = useState(false);
  const [transcript, setTranscript] = useState("");
  const [voiceMessage, setVoiceMessage] = useState<string | null>(null);
  const recognitionRef = useRef<SpeechRecognitionLike | null>(null);

  // Never leave the microphone open if the form is closed mid-dictation.
  useEffect(() => () => recognitionRef.current?.abort(), []);

  const suggestion = useMemo(() => suggestMerchant(values.store, merchants), [values.store, merchants]);
  const suggestedCategory = suggestion
    ? (categories.find((category) => category.id === suggestion.category_id) ?? null)
    : null;
  const effectiveCategoryId = categoryTouched ? values.category_id : (suggestedCategory?.id ?? values.category_id);
  const chosenCategory = categories.find((category) => category.id === effectiveCategoryId) ?? null;
  const showingSuggestion = !categoryTouched && suggestedCategory !== null;
  // The store is recognised, but the user chose something else: offer to learn it.
  const offerRemember =
    categoryTouched && suggestion !== null && chosenCategory !== null && suggestion.category_id !== chosenCategory.id;

  const parsedAmount = Number(values.amount);
  const isValid =
    values.date &&
    (values.amount_pending || (values.amount !== "" && !Number.isNaN(parsedAmount) && parsedAmount > 0));

  // Fills the form from a dictated sentence: amount, store, and a category --
  // first from the remembered store, then from keywords ("בנזין" -> דלק).
  function applySpokenText(text: string) {
    const spoken = parseSpokenExpense(text);
    const known = spoken.store ? suggestMerchant(spoken.store, merchants) : null;
    const keywordName = known ? null : categoryNameForText(`${spoken.store} ${text}`);
    const keywordCategory = keywordName
      ? (categories.find((category) => category.name === keywordName && !category.is_hidden) ?? null)
      : null;
    const knownCategory = known ? (categories.find((category) => category.id === known.category_id) ?? null) : null;

    if (spoken.amount === null && !spoken.store) {
      setVoiceMessage(`לא הצלחנו להבין סכום או חנות מ״${text}״. נסו שוב, לדוגמה: ״מאה חמישים שקלים ברמי לוי״.`);
      return;
    }

    setValues((v) => ({
      ...v,
      amount: spoken.amount !== null ? String(spoken.amount) : v.amount,
      amount_pending: spoken.amount !== null ? false : v.amount_pending,
      store: spoken.store || v.store,
      category_id: keywordCategory ? keywordCategory.id : v.category_id,
    }));
    if (keywordCategory) setCategoryTouched(true);
    else if (known) setCategoryTouched(false); // let the remembered store pick the category

    const found: string[] = [];
    if (spoken.amount !== null) found.push(`סכום ${spoken.amount}`);
    if (spoken.store) found.push(`חנות ${spoken.store}`);
    const category = knownCategory ?? keywordCategory;
    if (category) found.push(`קטגוריה ${category.name}`);
    setVoiceMessage(`✓ ${found.join(" · ")}. אפשר לתקן ולשמור.`);
  }

  function toggleVoice() {
    if (listening) {
      recognitionRef.current?.stop();
      return;
    }
    const Recognition = getSpeechRecognition();
    if (!Recognition) {
      setVoiceMessage("הדפדפן הזה לא תומך בזיהוי דיבור. נסו Chrome או Safari עדכני, או הקלידו ידנית.");
      return;
    }

    const recognition = new Recognition();
    recognition.lang = "he-IL";
    recognition.continuous = false;
    recognition.interimResults = true;

    let finalText = "";
    let failed = false;
    recognition.onresult = (event) => {
      let interim = "";
      finalText = "";
      for (let i = 0; i < event.results.length; i++) {
        const result = event.results[i];
        if (result.isFinal) finalText += result[0].transcript;
        else interim += result[0].transcript;
      }
      setTranscript((finalText + " " + interim).trim());
    };
    recognition.onerror = (event) => {
      failed = true;
      if (event.error !== "aborted") {
        setVoiceMessage(SPEECH_ERRORS[event.error] ?? "זיהוי הדיבור נכשל. נסו שוב.");
      }
    };
    recognition.onend = () => {
      setListening(false);
      recognitionRef.current = null;
      if (finalText.trim()) applySpokenText(finalText.trim());
      else if (!failed) setVoiceMessage("לא שמענו כלום. לחצו שוב ודברו קרוב למכשיר.");
    };

    recognitionRef.current = recognition;
    setTranscript("");
    setVoiceMessage(null);
    try {
      recognition.start();
      setListening(true);
    } catch {
      setVoiceMessage("לא הצלחנו להפעיל את המיקרופון. נסו שוב.");
    }
  }

  async function handleDelete() {
    if (!onDelete || submitting) return;
    setSubmitting(true);
    await onDelete();
    setSubmitting(false);
    setConfirmingDelete(false);
  }

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    if (!isValid || submitting) return;
    setSubmitting(true);
    await onSubmit({ ...values, category_id: effectiveCategoryId });
    setSubmitting(false);
  }

  // First-pass OCR, entirely in the browser (tesseract.js, loaded only when a
  // receipt is scanned): pulls out the total, store, date and the purchased
  // items, and pre-fills the form. The user always reviews it before saving.
  async function scanReceipt(file: File) {
    setScanning(true);
    setScanMessage("סורק את הקבלה... (בפעם הראשונה ההורדה של מנוע הזיהוי לוקחת רגע)");
    try {
      const image = await prepareForOcr(file);
      const { createWorker } = await import("tesseract.js");
      const worker = await createWorker("heb+eng");
      const { data } = await worker.recognize(image);
      await worker.terminate();
      const parsed = parseReceiptText(data.text);
      const details = formatReceiptItems(parsed.items);

      setValues((v) => {
        const next = { ...v };
        if (parsed.amount !== null && (v.amount === "" || Number(v.amount) === 0)) next.amount = String(parsed.amount);
        if (parsed.store && !v.store.trim()) next.store = parsed.store;
        if (parsed.date) next.date = parsed.date;
        if (details && !v.notes.includes("פירוט קנייה")) {
          next.notes = v.notes.trim() ? `${v.notes.trim()}\n\n${details}` : details;
        }
        return next;
      });

      const found: string[] = [];
      if (parsed.amount !== null) found.push(`סכום ${parsed.amount}`);
      if (parsed.store) found.push(`חנות "${parsed.store}"`);
      if (parsed.date) found.push(`תאריך ${parsed.date}`);
      if (parsed.items.length > 0) found.push(`${parsed.items.length} פריטים`);
      setScanMessage(
        found.length > 0
          ? `זוהה: ${found.join(" · ")}. כדאי לעבור על הפרטים לפני השמירה.`
          : "לא הצלחנו לזהות פרטים בקבלה - אפשר למלא ידנית (ננסה שוב עם תמונה חדה ובתאורה טובה)."
      );
    } catch (err) {
      console.error("[OCR] סריקת קבלה:", err);
      setScanMessage("הסריקה נכשלה (ייתכן שאין חיבור לאינטרנט). אפשר למלא ידנית.");
    } finally {
      setScanning(false);
    }
  }

  async function uploadReceipt(file: File) {
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

  function handleReceiptChange(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    if (file.size > MAX_IMAGE_BYTES) {
      setUploadError("התמונה גדולה מדי (מקסימום 5MB)");
      return;
    }
    setReceiptFile(file);
    setScanMessage(null);
    // Save the photo and read it at the same time -- no extra tap needed.
    void uploadReceipt(file);
    void scanReceipt(file);
  }

  const fieldClass =
    "w-full rounded-xl border border-amber-200 bg-white px-3 py-2 text-sm text-stone-700 outline-none focus:border-amber-400 dark:border-amber-900/50 dark:bg-stone-950 dark:text-stone-200";
  const receiptButtonClass =
    "flex cursor-pointer items-center gap-2 rounded-xl border border-dashed border-amber-300 px-3 py-2 text-sm text-amber-700 transition-colors hover:bg-amber-50 dark:border-amber-800 dark:text-amber-400 dark:hover:bg-stone-800";

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

            {!editingExpense && (
              <div className="flex flex-col gap-1.5">
                <button
                  type="button"
                  onClick={toggleVoice}
                  className={`flex w-full items-center justify-center gap-2 rounded-xl px-3 py-3 text-sm font-semibold transition-colors ${
                    listening
                      ? "animate-pulse bg-rose-500 text-white hover:bg-rose-600"
                      : "border border-amber-300 bg-amber-50 text-amber-800 hover:bg-amber-100 dark:border-amber-800 dark:bg-amber-950/30 dark:text-amber-300 dark:hover:bg-amber-950/50"
                  }`}
                >
                  <Mic className="h-4 w-4" />
                  {listening ? "מקשיב... לחצו לעצירה" : "🎙️ הקלט הוצאה"}
                </button>
                {listening && (
                  <p className="text-center text-xs text-stone-500 dark:text-stone-400">
                    {transcript || "אמרו למשל: ״מאה חמישים שקלים ברמי לוי״"}
                  </p>
                )}
                {!listening && voiceMessage && (
                  <p className="text-center text-xs text-stone-600 dark:text-stone-300">{voiceMessage}</p>
                )}
              </div>
            )}

            <div>
              <p className="mb-1.5 text-xs font-medium text-stone-500 dark:text-stone-400">קבלה / חשבונית (לא חובה)</p>
              {values.receipt_url || receiptFile ? (
                <div className="flex items-start gap-3">
                  {values.receipt_url ? (
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
                  ) : (
                    <p className="text-xs text-stone-500 dark:text-stone-400">{uploading ? "מעלה קבלה..." : ""}</p>
                  )}
                  {receiptFile && (
                    <button
                      type="button"
                      onClick={() => void scanReceipt(receiptFile)}
                      disabled={scanning}
                      className="flex items-center gap-1.5 rounded-xl border border-amber-300 px-3 py-2 text-sm font-medium text-amber-700 transition-colors hover:bg-amber-50 disabled:opacity-50 dark:border-amber-800 dark:text-amber-400 dark:hover:bg-stone-800"
                    >
                      <ScanLine className="h-4 w-4" />
                      {scanning ? "סורק..." : "סריקה מחדש"}
                    </button>
                  )}
                </div>
              ) : (
                <div className="flex flex-wrap gap-2">
                  <label className={receiptButtonClass}>
                    <Camera className="h-4 w-4" />
                    צלם קבלה
                    <input
                      type="file"
                      accept="image/*"
                      capture="environment"
                      className="hidden"
                      disabled={uploading}
                      onChange={handleReceiptChange}
                    />
                  </label>
                  <label className={receiptButtonClass}>
                    <ImageIcon className="h-4 w-4" />
                    העלה מהגלריה
                    <input
                      type="file"
                      accept="image/*"
                      className="hidden"
                      disabled={uploading}
                      onChange={handleReceiptChange}
                    />
                  </label>
                </div>
              )}
              {uploadError && <p className="mt-1 text-xs text-rose-600 dark:text-rose-400">{uploadError}</p>}
              {scanMessage && <p className="mt-1.5 text-xs text-stone-600 dark:text-stone-300">{scanMessage}</p>}
            </div>

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
              <CategorySelect
                categories={categories}
                value={effectiveCategoryId}
                onChange={(categoryId) => {
                  setCategoryTouched(true);
                  setValues((v) => ({ ...v, category_id: categoryId }));
                }}
                className={fieldClass}
              />
              {showingSuggestion && (
                <p className="mt-1 flex items-center gap-1 text-xs text-emerald-700 dark:text-emerald-400">
                  <Sparkles className="h-3 w-3" />
                  החנות מוכרת - קטגוריה: {suggestedCategory?.name}. אפשר לשנות בחופשיות.
                </p>
              )}
              {offerRemember && (
                <label className="mt-1.5 flex cursor-pointer items-start gap-1.5 rounded-lg bg-amber-50 p-2 text-xs text-amber-800 dark:bg-amber-950/30 dark:text-amber-300">
                  <input
                    type="checkbox"
                    className="mt-0.5"
                    checked={values.remember_mapping}
                    onChange={(event) => setValues((v) => ({ ...v, remember_mapping: event.target.checked }))}
                  />
                  <span>
                    &quot;{suggestion?.store_name}&quot; משויכת כרגע ל-{suggestedCategory?.name}. לשמור את &quot;
                    {chosenCategory?.name}&quot; כשיוך החדש לפעמים הבאות?
                  </span>
                </label>
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
              <p className="mb-1.5 text-xs font-medium text-stone-500 dark:text-stone-400">
                הערות / פירוט הקנייה (לא חובה)
              </p>
              <textarea
                value={values.notes}
                onChange={(event) => setValues((v) => ({ ...v, notes: event.target.value }))}
                rows={values.notes.includes("\n") ? 7 : 2}
                placeholder="פירוט נוסף..."
                className={`${fieldClass} resize-none`}
              />
            </div>
          </div>

          <div className="flex shrink-0 gap-2 border-t border-amber-100 bg-white p-4 dark:border-amber-950/30 dark:bg-stone-900">
            {onDelete &&
              (confirmingDelete ? (
                <button
                  type="button"
                  onClick={handleDelete}
                  disabled={submitting}
                  className="shrink-0 rounded-xl bg-rose-500 px-3 py-3 text-sm font-semibold text-white transition-colors hover:bg-rose-600 disabled:opacity-50"
                >
                  בטוח? מחיקה
                </button>
              ) : (
                <button
                  type="button"
                  onClick={() => setConfirmingDelete(true)}
                  aria-label="מחיקת הוצאה"
                  className="shrink-0 rounded-xl border border-rose-200 px-3 py-3 text-rose-500 transition-colors hover:bg-rose-50 dark:border-rose-900/50 dark:hover:bg-rose-950/30"
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              ))}
            <button
              type="submit"
              disabled={!isValid || submitting}
              className="flex-1 rounded-xl bg-amber-500 px-4 py-3 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-amber-600 disabled:opacity-50"
            >
              {editingExpense ? "שמירת שינויים" : "שמירת הוצאה"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

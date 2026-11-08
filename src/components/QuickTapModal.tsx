"use client";

import { useMemo, useState } from "react";
import { Check, Delete, Loader2, Plus, X, Zap } from "lucide-react";
import { quickVendors, resolveQuickCategory } from "@/lib/quickAdd";
import type { BudgetCategory, BudgetExpense, MerchantCategory } from "@/lib/budgetData";

const KEYS = ["1", "2", "3", "4", "5", "6", "7", "8", "9", ".", "0", "back"] as const;
const MAX_CHARS = 8;

/** Adds one keypad press to the amount text: digits, one dot, at most two decimals. */
function press(current: string, key: string): string {
  if (key === "back") return current.slice(0, -1);
  if (current.length >= MAX_CHARS) return current;
  if (key === ".") {
    if (current.includes(".")) return current;
    return current === "" ? "0." : `${current}.`;
  }
  const decimals = current.split(".")[1];
  if (decimals !== undefined && decimals.length >= 2) return current;
  if (current === "0") return key;
  return current + key;
}

/**
 * The 3-second way to log a purchase: pick the shop from a grid of the usual ones, type the amount on a big
 * numeric keypad, confirm. The category comes from the shop (remembered, or the built-in guess).
 */
export default function QuickTapModal({
  categories,
  merchants,
  expenses,
  onClose,
  onOther,
  onSave,
}: {
  categories: BudgetCategory[];
  merchants: MerchantCategory[];
  expenses: BudgetExpense[];
  onClose: () => void;
  /** "אחר": open the full expense form instead */
  onOther: () => void;
  /** Saves the purchase; returns an error message, or null when it worked. */
  onSave: (vendor: string, amount: number) => Promise<string | null>;
}) {
  const [vendor, setVendor] = useState<string | null>(null);
  const [digits, setDigits] = useState("");
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const vendors = useMemo(
    () => quickVendors(expenses, merchants, new Set(categories.filter((category) => category.kind !== "variable").map((category) => category.id))),
    [expenses, merchants, categories]
  );
  const category = useMemo(() => (vendor ? resolveQuickCategory(vendor, merchants, categories) : null), [vendor, merchants, categories]);
  const amount = Number(digits);
  const valid = digits !== "" && Number.isFinite(amount) && amount > 0;

  async function confirm() {
    if (!vendor || !valid || saving) return;
    setSaving(true);
    setError(null);
    const failure = await onSave(vendor, amount);
    setSaving(false);
    if (failure) {
      setError(failure);
      return;
    }
    setSaved(true);
    setTimeout(onClose, 700);
  }

  return (
    <div className="fixed inset-0 z-[60] flex items-end justify-center bg-black/40 sm:items-center">
      <div
        role="dialog"
        aria-modal="true"
        aria-label="הוצאה מהירה"
        className="flex w-full flex-col overflow-hidden rounded-t-3xl bg-white pb-[env(safe-area-inset-bottom)] shadow-lg sm:max-w-sm sm:rounded-3xl dark:bg-stone-900"
      >
        <div className="flex items-center justify-between border-b border-amber-100 p-4 dark:border-amber-950/30">
          <h2 className="flex items-center gap-2 text-lg font-bold text-stone-800 dark:text-stone-100">
            <Zap className="h-5 w-5 text-amber-500" />
            {vendor ? vendor : "הוצאה מהירה"}
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

        {vendor === null ? (
          <div className="p-4">
            <p className="mb-3 text-sm text-stone-500 dark:text-stone-400">איפה קניתם?</p>
            <div className="grid grid-cols-2 gap-2.5">
              {vendors.map((name) => (
                <button
                  key={name}
                  type="button"
                  onClick={() => setVendor(name)}
                  className="flex min-h-16 items-center justify-center rounded-2xl border border-amber-200 bg-amber-50 px-2 text-center text-base font-semibold text-stone-800 transition active:scale-95 hover:bg-amber-100 dark:border-amber-900/50 dark:bg-amber-950/20 dark:text-stone-100"
                >
                  {name}
                </button>
              ))}
              <button
                type="button"
                onClick={onOther}
                className="flex min-h-16 items-center justify-center gap-1.5 rounded-2xl border border-dashed border-stone-300 px-2 text-base font-semibold text-stone-500 transition active:scale-95 hover:bg-stone-50 dark:border-stone-700 dark:text-stone-400 dark:hover:bg-stone-800"
              >
                <Plus className="h-4 w-4" />
                אחר
              </button>
            </div>
          </div>
        ) : (
          <div className="flex flex-col gap-3 p-4">
            <div className="flex items-end justify-between gap-2">
              <div>
                <p className="text-xs text-stone-500 dark:text-stone-400">{category ? `קטגוריה: ${category.name}` : "ללא קטגוריה (אפשר לשייך אחר כך)"}</p>
                <p className="mt-1 text-4xl font-extrabold tabular-nums text-stone-800 dark:text-stone-100" aria-live="polite" data-testid="quick-amount">
                  ₪{digits === "" ? "0" : digits}
                </p>
              </div>
              <button type="button" onClick={() => { setVendor(null); setDigits(""); setError(null); }} className="pb-1 text-xs font-medium text-stone-500 underline">
                החלפת חנות
              </button>
            </div>

            {error && <p role="alert" className="rounded-xl bg-rose-50 px-3 py-2 text-sm text-rose-700 dark:bg-rose-950/30 dark:text-rose-400">{error}</p>}

            <div dir="ltr" className="grid grid-cols-3 gap-2">
              {KEYS.map((key) => (
                <button
                  key={key}
                  type="button"
                  onClick={() => setDigits((current) => press(current, key))}
                  aria-label={key === "back" ? "מחיקה" : key === "." ? "נקודה עשרונית" : key}
                  className="flex h-16 items-center justify-center rounded-2xl bg-stone-100 text-2xl font-semibold text-stone-800 transition active:scale-95 active:bg-stone-200 dark:bg-stone-800 dark:text-stone-100"
                >
                  {key === "back" ? <Delete className="h-6 w-6" /> : key}
                </button>
              ))}
            </div>

            <button
              type="button"
              disabled={!valid || saving || saved}
              onClick={confirm}
              className="flex h-14 w-full items-center justify-center gap-2 rounded-2xl bg-amber-500 text-lg font-bold text-white transition active:scale-95 hover:bg-amber-600 disabled:opacity-50"
            >
              {saving ? <Loader2 className="h-5 w-5 animate-spin" /> : <Check className="h-5 w-5" />}
              {saved ? "נשמר" : saving ? "שומר..." : "אישור"}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

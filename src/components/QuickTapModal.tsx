"use client";

import { useEffect, useMemo, useState, type FormEvent } from "react";
import { ArrowRight, Check, Delete, Loader2, Plus, Settings2, Trash2, X, Zap } from "lucide-react";
import CategorySelect from "@/components/CategorySelect";
import { loadQuickHidden, saveQuickHidden, saveQuickStore, updateMerchant } from "@/lib/budgetActions";
import { quickVendors, resolveQuickCategory } from "@/lib/quickAdd";
import { normalizeStoreKey, type BudgetCategory, type BudgetExpense, type MerchantCategory } from "@/lib/budgetData";
import { friendlyErrorMessage } from "@/lib/supabaseErrors";

const KEYS = ["1", "2", "3", "4", "5", "6", "7", "8", "9", ".", "0", "back"] as const;
const MAX_CHARS = 8;
const HIDDEN_CACHE_KEY = "samama-home:quick-hidden";
const GRID_SIZE = 8;
const MANAGE_SIZE = 40;

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

function readHiddenCache(): string[] {
  try {
    const parsed: unknown = JSON.parse(window.localStorage.getItem(HIDDEN_CACHE_KEY) ?? "[]");
    return Array.isArray(parsed) ? parsed.filter((entry): entry is string => typeof entry === "string") : [];
  } catch {
    return [];
  }
}

function writeHiddenCache(keys: string[]) {
  try {
    window.localStorage.setItem(HIDDEN_CACHE_KEY, JSON.stringify(keys));
  } catch {
    // private mode / storage full: the shared copy in the database still holds
  }
}

const selectClass =
  "min-w-0 max-w-[10rem] shrink-0 rounded-lg border border-stone-200 bg-white px-1.5 py-1.5 text-xs text-stone-700 outline-none focus:border-amber-400 dark:border-stone-700 dark:bg-stone-950 dark:text-stone-200";

/**
 * The 3-second way to log a purchase: pick the shop from a grid of the usual ones, type the amount on a big
 * numeric keypad, confirm. The category comes from the shop (remembered, or the built-in guess). "ניהול חנויות"
 * lets the family add shops, remove ones they don't use, and choose each shop's category.
 */
export default function QuickTapModal({
  categories,
  merchants,
  expenses,
  onClose,
  onOther,
  onSave,
  onMerchantsChanged,
}: {
  categories: BudgetCategory[];
  merchants: MerchantCategory[];
  expenses: BudgetExpense[];
  onClose: () => void;
  /** "אחר": open the full expense form instead */
  onOther: () => void;
  /** Saves the purchase; returns an error message, or null when it worked. */
  onSave: (vendor: string, amount: number) => Promise<string | null>;
  /** The shop list was edited: reload the remembered shops. */
  onMerchantsChanged: () => void | Promise<unknown>;
}) {
  const [vendor, setVendor] = useState<string | null>(null);
  const [digits, setDigits] = useState("");
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [managing, setManaging] = useState(false);
  const [busy, setBusy] = useState(false);
  const [manageError, setManageError] = useState<string | null>(null);
  const [newStore, setNewStore] = useState("");
  const [newCategory, setNewCategory] = useState("");
  // Shops removed from the grid (normalized names): cached locally, shared through the database.
  const [hidden, setHidden] = useState<string[]>(readHiddenCache);

  useEffect(() => {
    let cancelled = false;
    void loadQuickHidden().then((keys) => {
      if (cancelled || !keys) return;
      setHidden(keys);
      writeHiddenCache(keys);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const spendingCategories = useMemo(() => categories.filter((category) => category.kind !== "income"), [categories]);
  const skipIds = useMemo(
    () => new Set(categories.filter((category) => category.kind !== "variable").map((category) => category.id)),
    [categories]
  );
  const hiddenSet = useMemo(() => new Set(hidden), [hidden]);
  const vendors = useMemo(
    () => quickVendors(expenses, merchants, skipIds, hiddenSet, managing ? MANAGE_SIZE : GRID_SIZE),
    [expenses, merchants, skipIds, hiddenSet, managing]
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

  async function updateHidden(next: string[]) {
    setHidden(next);
    writeHiddenCache(next);
    const { error: saveError } = await saveQuickHidden(next);
    if (saveError) setManageError("הרשימה נשמרה רק במכשיר הזה: " + friendlyErrorMessage(saveError));
  }

  async function handleAddStore(event: FormEvent) {
    event.preventDefault();
    const name = newStore.trim();
    if (!name || !newCategory || busy) return;
    setBusy(true);
    setManageError(null);
    const { error: saveError } = await saveQuickStore(name, newCategory);
    if (saveError) setManageError(friendlyErrorMessage(saveError));
    else {
      const key = normalizeStoreKey(name);
      if (hiddenSet.has(key)) await updateHidden(hidden.filter((entry) => entry !== key));
      setNewStore("");
      setNewCategory("");
      await onMerchantsChanged();
    }
    setBusy(false);
  }

  async function handleChangeCategory(name: string, categoryId: string) {
    if (!categoryId || busy) return;
    setBusy(true);
    setManageError(null);
    const { error: saveError } = await saveQuickStore(name, categoryId);
    if (saveError) setManageError(friendlyErrorMessage(saveError));
    else await onMerchantsChanged();
    setBusy(false);
  }

  async function handleRemoveStore(name: string) {
    if (busy) return;
    setBusy(true);
    setManageError(null);
    const key = normalizeStoreKey(name);
    await updateHidden([...hidden.filter((entry) => entry !== key), key]);
    // Un-star it too (keeps the store -> category memory, so past and future expenses still file correctly).
    const remembered = merchants.find((merchant) => merchant.store_key === key && merchant.is_favorite);
    if (remembered) {
      await updateMerchant(remembered.id, { is_favorite: false });
      await onMerchantsChanged();
    }
    setBusy(false);
  }

  const title = managing ? "ניהול חנויות" : vendor ? vendor : "הוצאה מהירה";

  return (
    <div className="fixed inset-0 z-[60] flex items-end justify-center bg-black/40 sm:items-center">
      <div
        role="dialog"
        aria-modal="true"
        aria-label="הוצאה מהירה"
        className="flex max-h-[92dvh] w-full flex-col overflow-hidden rounded-t-3xl bg-white pb-[env(safe-area-inset-bottom)] shadow-lg sm:max-w-sm sm:rounded-3xl dark:bg-stone-900"
      >
        <div className="flex shrink-0 items-center justify-between border-b border-amber-100 p-4 dark:border-amber-950/30">
          <h2 className="flex items-center gap-2 text-lg font-bold text-stone-800 dark:text-stone-100">
            {managing ? <Settings2 className="h-5 w-5 text-amber-500" /> : <Zap className="h-5 w-5 text-amber-500" />}
            {title}
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

        {managing ? (
          <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto p-4">
            <p className="text-xs text-stone-500 dark:text-stone-400">
              החנויות שמופיעות ב&quot;הוצאה מהירה&quot;. בחרו לכל חנות קטגוריה - ההוצאה תיכנס אליה אוטומטית ותעדכן את התקציב.
            </p>
            {manageError && (
              <p role="alert" className="rounded-xl bg-rose-50 px-3 py-2 text-xs text-rose-700 dark:bg-rose-950/30 dark:text-rose-400">
                {manageError}
              </p>
            )}

            <form onSubmit={handleAddStore} className="flex flex-col gap-1.5 rounded-2xl border border-dashed border-amber-300 bg-amber-50/60 p-2.5 dark:border-amber-900/50 dark:bg-amber-950/10">
              <p className="text-xs font-medium text-stone-600 dark:text-stone-300">הוספת חנות</p>
              <div className="flex gap-1.5">
                <input
                  type="text"
                  value={newStore}
                  onChange={(event) => setNewStore(event.target.value)}
                  placeholder="שם החנות..."
                  aria-label="שם החנות החדשה"
                  maxLength={40}
                  className="min-w-0 flex-1 rounded-lg border border-stone-200 bg-white px-2 py-1.5 text-sm text-stone-700 outline-none focus:border-amber-400 dark:border-stone-700 dark:bg-stone-950 dark:text-stone-200"
                />
                <CategorySelect
                  categories={spendingCategories}
                  value={newCategory}
                  onChange={setNewCategory}
                  emptyLabel="קטגוריה..."
                  ariaLabel="קטגוריה לחנות החדשה"
                  className={selectClass}
                />
                <button
                  type="submit"
                  disabled={!newStore.trim() || !newCategory || busy}
                  aria-label="הוספת חנות"
                  className="shrink-0 rounded-lg bg-amber-500 px-3 text-white transition-colors hover:bg-amber-600 disabled:opacity-50"
                >
                  {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
                </button>
              </div>
            </form>

            <ul className="flex flex-col gap-1.5">
              {vendors.map((name) => {
                const current = resolveQuickCategory(name, merchants, categories);
                return (
                  <li key={name} className="flex items-center gap-2 rounded-xl border border-stone-200 bg-white px-2.5 py-1.5 dark:border-stone-700 dark:bg-stone-900">
                    <span className="min-w-0 flex-1 truncate text-sm font-medium text-stone-800 dark:text-stone-100">{name}</span>
                    <CategorySelect
                      categories={spendingCategories}
                      value={current?.id ?? ""}
                      onChange={(categoryId) => void handleChangeCategory(name, categoryId)}
                      emptyLabel="בחרו קטגוריה"
                      ariaLabel={`קטגוריה עבור ${name}`}
                      className={selectClass}
                    />
                    <button
                      type="button"
                      onClick={() => void handleRemoveStore(name)}
                      disabled={busy}
                      aria-label={`הסרת ${name} מההוצאה המהירה`}
                      className="shrink-0 rounded-full p-1.5 text-stone-400 hover:bg-red-50 hover:text-red-500 disabled:opacity-50 dark:hover:bg-red-950/30"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </li>
                );
              })}
              {vendors.length === 0 && <li className="text-xs text-stone-400 dark:text-stone-500">אין חנויות. הוסיפו חנות למעלה.</li>}
            </ul>

            <button
              type="button"
              onClick={() => setManaging(false)}
              className="flex h-12 w-full shrink-0 items-center justify-center gap-2 rounded-2xl bg-amber-500 text-base font-bold text-white transition active:scale-95 hover:bg-amber-600"
            >
              <ArrowRight className="h-4 w-4" />
              סיום
            </button>
          </div>
        ) : vendor === null ? (
          <div className="overflow-y-auto p-4">
            <div className="mb-3 flex items-center justify-between gap-2">
              <p className="text-sm text-stone-500 dark:text-stone-400">איפה קניתם?</p>
              <button
                type="button"
                onClick={() => {
                  setManageError(null);
                  setManaging(true);
                }}
                className="flex items-center gap-1 rounded-full border border-stone-200 px-2.5 py-1 text-xs font-medium text-stone-600 hover:bg-stone-50 dark:border-stone-700 dark:text-stone-300 dark:hover:bg-stone-800"
              >
                <Settings2 className="h-3.5 w-3.5" />
                ניהול חנויות
              </button>
            </div>
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
          <div className="flex flex-col gap-3 overflow-y-auto p-4">
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

"use client";

import { useState } from "react";
import { ArrowRight, Check, Minus, Plus, Sparkles, Trash2, X } from "lucide-react";
import { parseShoppingText } from "@/lib/parseShoppingText";
import {
  findExactProductMatch,
  findExistingShoppingItem,
  findFuzzyProductMatch,
} from "@/lib/shoppingMatch";
import { type MasterProduct, type ShoppingItem } from "@/lib/shoppingData";
import ErrorBanner from "@/components/ErrorBanner";

export type ImportItem = {
  id: string;
  name: string;
  qty: number;
  matchedProduct: MasterProduct | null;
  suggestion: MasterProduct | null;
};

export type ImportTarget = "shopping" | "arsenal" | "both";

const TARGET_OPTIONS: { value: ImportTarget; label: string }[] = [
  { value: "shopping", label: "🛒 רק לקניות בסופר" },
  { value: "arsenal", label: "📦 רק לארסנל" },
  { value: "both", label: "🔄 גם וגם" },
];

function resolveMatch(products: MasterProduct[], name: string): Pick<ImportItem, "matchedProduct" | "suggestion"> {
  const matchedProduct = findExactProductMatch(products, name);
  if (matchedProduct) return { matchedProduct, suggestion: null };
  const fuzzy = findFuzzyProductMatch(products, name);
  return { matchedProduct: null, suggestion: fuzzy?.product ?? null };
}

function unmatchedBadge(target: ImportTarget): string {
  if (target === "shopping") return "חד-פעמי (לא יישמר בארסנל)";
  if (target === "arsenal") return "ייווצר בארסנל";
  return "מוצר חדש - יתווסף לארסנל";
}

function statusLabel(
  item: ImportItem,
  activeShoppingItems: ShoppingItem[],
  target: ImportTarget
): { text: string; tone: "emerald" | "sky" | "amber" } {
  const inArsenal = Boolean(item.matchedProduct);
  const inShopping = Boolean(findExistingShoppingItem(item.matchedProduct, item.name, activeShoppingItems));

  if (inArsenal && inShopping) return { text: "כבר קיים בארסנל וגם ברשימת הקניות", tone: "sky" };
  if (inShopping) return { text: "קיים ברשימת הקניות בלבד", tone: "sky" };
  if (inArsenal) return { text: "קיים בארסנל בלבד", tone: "emerald" };
  return { text: unmatchedBadge(target), tone: "amber" };
}

type View = "paste" | "preview";

export default function WhatsAppImportModal({
  products,
  activeShoppingItems,
  onClose,
  onConfirm,
}: {
  products: MasterProduct[];
  activeShoppingItems: ShoppingItem[];
  onClose: () => void;
  onConfirm: (items: ImportItem[], target: ImportTarget) => Promise<string | null>;
}) {
  const [view, setView] = useState<View>("paste");
  const [text, setText] = useState("");
  const [items, setItems] = useState<ImportItem[]>([]);
  const [target, setTarget] = useState<ImportTarget>("shopping");
  const [confirming, setConfirming] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function handleParse() {
    const parsed = parseShoppingText(text);
    setItems(
      parsed.map((line) => ({
        id: crypto.randomUUID(),
        name: line.name,
        qty: line.qty,
        ...resolveMatch(products, line.name),
      }))
    );
    setError(null);
    setView("preview");
  }

  function updateName(id: string, name: string) {
    setItems((prev) =>
      prev.map((item) => (item.id === id ? { ...item, name, ...resolveMatch(products, name) } : item))
    );
  }

  function acceptSuggestion(id: string) {
    setItems((prev) =>
      prev.map((item) =>
        item.id === id && item.suggestion
          ? { ...item, name: item.suggestion.name, matchedProduct: item.suggestion, suggestion: null }
          : item
      )
    );
  }

  function dismissSuggestion(id: string) {
    setItems((prev) => prev.map((item) => (item.id === id ? { ...item, suggestion: null } : item)));
  }

  function changeQty(id: string, delta: number) {
    setItems((prev) =>
      prev.map((item) => (item.id === id ? { ...item, qty: Math.max(1, item.qty + delta) } : item))
    );
  }

  function removeItem(id: string) {
    setItems((prev) => prev.filter((item) => item.id !== id));
  }

  async function handleConfirm() {
    const validItems = items.filter((item) => item.name.trim());
    if (validItems.length === 0 || confirming) return;
    setConfirming(true);
    setError(null);
    const message = await onConfirm(validItems, target);
    setConfirming(false);
    if (message) {
      setError(message);
      return;
    }
    onClose();
  }

  const confirmLabel =
    target === "arsenal" ? `שמירה בארסנל (${items.length})` : `הוספה לרשימה (${items.length})`;

  return (
    <div className="fixed inset-0 z-[60] flex items-end justify-center bg-black/40 sm:items-center">
      <div className="flex max-h-[85dvh] w-full flex-col overflow-hidden rounded-t-3xl bg-white shadow-lg sm:max-w-md sm:rounded-3xl dark:bg-stone-900">
        <div className="flex shrink-0 items-center justify-between border-b border-amber-100 p-4 dark:border-amber-950/30">
          <div className="flex items-center gap-2">
            {view === "preview" && (
              <button
                type="button"
                onClick={() => setView("paste")}
                aria-label="חזרה לעריכת הטקסט"
                className="rounded-full p-1.5 text-stone-400 hover:bg-stone-100 dark:hover:bg-stone-800"
              >
                <ArrowRight className="h-4 w-4" />
              </button>
            )}
            <h2 className="text-lg font-bold text-stone-800 dark:text-stone-100">
              ייבוא מהיר מוואטסאפ
            </h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="סגירה"
            className="rounded-full p-1.5 text-stone-400 hover:bg-stone-100 dark:hover:bg-stone-800"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {view === "paste" ? (
          <>
            <div className="flex flex-1 flex-col gap-3 overflow-y-auto p-4">
              <p className="text-xs text-stone-500 dark:text-stone-400">
                הדביקו כאן רשימה שהועתקה מוואטסאפ (או כל טקסט חופשי) - כל שורה או פריט
                מופרד בפסיק יזוהה בנפרד. אפשר גם לציין כמות, למשל &quot;חלב 2&quot; או
                &quot;לחם x2&quot;.
              </p>
              <textarea
                autoFocus
                value={text}
                onChange={(event) => setText(event.target.value)}
                rows={8}
                placeholder={"לדוגמה:\n- חלב 2\n- ביצים\n- עגבניות x3\nלחם, גבינה צהובה"}
                className="w-full flex-1 resize-none rounded-xl border border-amber-200 bg-white p-3 text-sm text-stone-700 outline-none focus:border-amber-400 dark:border-amber-900/50 dark:bg-stone-950 dark:text-stone-200"
              />
            </div>
            <div className="shrink-0 border-t border-amber-100 bg-white p-4 dark:border-amber-950/30 dark:bg-stone-900">
              <button
                type="button"
                onClick={handleParse}
                disabled={!text.trim()}
                className="flex w-full items-center justify-center gap-1.5 rounded-xl bg-amber-500 px-4 py-3 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-amber-600 disabled:opacity-50"
              >
                <Sparkles className="h-4 w-4" />
                תצוגה מקדימה
              </button>
            </div>
          </>
        ) : (
          <>
            <div className="flex flex-1 flex-col gap-2 overflow-y-auto p-4">
              {error && <ErrorBanner message={error} onDismiss={() => setError(null)} />}

              <div className="flex flex-col gap-1.5">
                <p className="text-xs font-medium text-stone-500 dark:text-stone-400">
                  לאן להוסיף את הפריטים?
                </p>
                <div className="grid grid-cols-3 gap-1.5 rounded-2xl bg-amber-50 p-1 dark:bg-stone-800">
                  {TARGET_OPTIONS.map((option) => (
                    <button
                      key={option.value}
                      type="button"
                      onClick={() => setTarget(option.value)}
                      className={`rounded-xl px-1.5 py-2 text-[11px] font-medium leading-tight transition-colors sm:text-xs ${
                        target === option.value
                          ? "bg-white text-amber-700 shadow-sm dark:bg-stone-700 dark:text-amber-400"
                          : "text-stone-500 dark:text-stone-400"
                      }`}
                    >
                      {option.label}
                    </button>
                  ))}
                </div>
              </div>

              {items.length === 0 ? (
                <p className="rounded-2xl border border-dashed border-amber-200 p-6 text-center text-sm text-stone-500 dark:border-amber-900/40 dark:text-stone-400">
                  לא זוהו מוצרים בטקסט. חיזרו אחורה ונסו שוב.
                </p>
              ) : (
                <>
                  <p className="text-xs text-stone-500 dark:text-stone-400">
                    זוהו {items.length} מוצרים. אפשר לערוך שם/כמות או להסיר לפני האישור.
                  </p>
                  <ul className="flex flex-col gap-1.5">
                    {items.map((item) => {
                      const status = statusLabel(item, activeShoppingItems, target);
                      return (
                        <li
                          key={item.id}
                          className="flex flex-col gap-1.5 rounded-xl border border-stone-200 bg-white p-2 dark:border-stone-700 dark:bg-stone-900"
                        >
                          <div className="flex items-center gap-2">
                            <div className="min-w-0 flex-1">
                              <input
                                type="text"
                                value={item.name}
                                onChange={(event) => updateName(item.id, event.target.value)}
                                className="w-full min-w-0 bg-transparent text-sm text-stone-800 outline-none dark:text-stone-100"
                              />
                              <span
                                className={`text-[11px] ${
                                  status.tone === "emerald"
                                    ? "text-emerald-600 dark:text-emerald-400"
                                    : status.tone === "sky"
                                      ? "text-sky-600 dark:text-sky-400"
                                      : "text-amber-600 dark:text-amber-400"
                                }`}
                              >
                                {status.text}
                              </span>
                            </div>
                            <div className="flex shrink-0 items-center gap-1">
                              <button
                                type="button"
                                onClick={() => changeQty(item.id, -1)}
                                aria-label="הפחתת כמות"
                                className="flex h-6 w-6 items-center justify-center rounded-full bg-amber-50 text-amber-700 hover:bg-amber-100 dark:bg-stone-800 dark:text-amber-400 dark:hover:bg-stone-700"
                              >
                                <Minus className="h-3 w-3" />
                              </button>
                              <span className="w-4 text-center text-sm font-semibold tabular-nums">
                                {item.qty}
                              </span>
                              <button
                                type="button"
                                onClick={() => changeQty(item.id, 1)}
                                aria-label="הוספת כמות"
                                className="flex h-6 w-6 items-center justify-center rounded-full bg-amber-50 text-amber-700 hover:bg-amber-100 dark:bg-stone-800 dark:text-amber-400 dark:hover:bg-stone-700"
                              >
                                <Plus className="h-3 w-3" />
                              </button>
                            </div>
                            <button
                              type="button"
                              onClick={() => removeItem(item.id)}
                              aria-label="הסרה מהרשימה"
                              className="shrink-0 rounded-full p-1 text-stone-400 hover:bg-red-50 hover:text-red-500 dark:hover:bg-red-950/30"
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                            </button>
                          </div>

                          {item.suggestion && (
                            <div className="flex items-center gap-2 rounded-lg bg-sky-50 px-2 py-1.5 text-xs text-sky-800 dark:bg-sky-950/30 dark:text-sky-300">
                              <span className="min-w-0 flex-1">
                                האם התכוונת ל&quot;{item.suggestion.name}&quot;?
                              </span>
                              <button
                                type="button"
                                onClick={() => acceptSuggestion(item.id)}
                                className="flex shrink-0 items-center gap-1 rounded-full bg-sky-600 px-2 py-1 text-[11px] font-medium text-white hover:bg-sky-700"
                              >
                                <Check className="h-3 w-3" />
                                כן
                              </button>
                              <button
                                type="button"
                                onClick={() => dismissSuggestion(item.id)}
                                aria-label="התעלמות מההצעה"
                                className="shrink-0 rounded-full p-1 text-sky-500 hover:bg-sky-100 dark:hover:bg-sky-900/40"
                              >
                                <X className="h-3 w-3" />
                              </button>
                            </div>
                          )}
                        </li>
                      );
                    })}
                  </ul>
                </>
              )}
            </div>

            <div className="shrink-0 border-t border-amber-100 bg-white p-4 dark:border-amber-950/30 dark:bg-stone-900">
              <button
                type="button"
                onClick={handleConfirm}
                disabled={items.length === 0 || confirming}
                className="w-full rounded-xl bg-amber-500 px-4 py-3 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-amber-600 disabled:opacity-50"
              >
                {confirming ? "מוסיף…" : confirmLabel}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

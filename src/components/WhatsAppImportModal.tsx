"use client";

import { useState } from "react";
import { ArrowRight, Minus, Plus, Sparkles, Trash2, X } from "lucide-react";
import { parseShoppingText } from "@/lib/parseShoppingText";
import { type MasterProduct } from "@/lib/shoppingData";
import ErrorBanner from "@/components/ErrorBanner";

export type ImportItem = {
  id: string;
  name: string;
  qty: number;
  matchedProduct: MasterProduct | null;
};

function findMatch(products: MasterProduct[], name: string): MasterProduct | null {
  const key = name.trim().toLowerCase();
  return products.find((product) => product.name.trim().toLowerCase() === key) ?? null;
}

type View = "paste" | "preview";

export default function WhatsAppImportModal({
  products,
  onClose,
  onConfirm,
}: {
  products: MasterProduct[];
  onClose: () => void;
  onConfirm: (items: ImportItem[]) => Promise<string | null>;
}) {
  const [view, setView] = useState<View>("paste");
  const [text, setText] = useState("");
  const [items, setItems] = useState<ImportItem[]>([]);
  const [confirming, setConfirming] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function handleParse() {
    const parsed = parseShoppingText(text);
    setItems(
      parsed.map((line) => ({
        id: crypto.randomUUID(),
        name: line.name,
        qty: line.qty,
        matchedProduct: findMatch(products, line.name),
      }))
    );
    setError(null);
    setView("preview");
  }

  function updateName(id: string, name: string) {
    setItems((prev) =>
      prev.map((item) =>
        item.id === id ? { ...item, name, matchedProduct: findMatch(products, name) } : item
      )
    );
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
    const message = await onConfirm(validItems);
    setConfirming(false);
    if (message) {
      setError(message);
      return;
    }
    onClose();
  }

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
                    {items.map((item) => (
                      <li
                        key={item.id}
                        className="flex items-center gap-2 rounded-xl border border-stone-200 bg-white p-2 dark:border-stone-700 dark:bg-stone-900"
                      >
                        <div className="min-w-0 flex-1">
                          <input
                            type="text"
                            value={item.name}
                            onChange={(event) => updateName(item.id, event.target.value)}
                            className="w-full min-w-0 bg-transparent text-sm text-stone-800 outline-none dark:text-stone-100"
                          />
                          <span
                            className={`text-[11px] ${
                              item.matchedProduct
                                ? "text-emerald-600 dark:text-emerald-400"
                                : "text-amber-600 dark:text-amber-400"
                            }`}
                          >
                            {item.matchedProduct ? "קיים בארסנל" : "מוצר חדש"}
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
                      </li>
                    ))}
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
                {confirming ? "מוסיף לרשימה…" : `הוספה לרשימה (${items.length})`}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

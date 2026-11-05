"use client";

import { useState } from "react";
import { X } from "lucide-react";
import { SHOPPING_CATEGORIES } from "@/lib/shoppingData";

/**
 * A quick sheet for a product that isn't known yet: pick its category with one tap (the likely one
 * is pre-highlighted) instead of dumping it into "uncategorised", and choose whether to keep it in
 * the permanent products list for next time.
 */
export default function QuickAddCategorySheet({
  name,
  suggestedCategory,
  defaultSaveToArsenal = true,
  onConfirm,
  onClose,
}: {
  name: string;
  suggestedCategory: string | null;
  defaultSaveToArsenal?: boolean;
  onConfirm: (category: string, saveToArsenal: boolean) => void;
  onClose: () => void;
}) {
  const [save, setSave] = useState(defaultSaveToArsenal);

  return (
    <div className="fixed inset-0 z-[60] flex items-end justify-center bg-black/40 sm:items-center" onClick={onClose}>
      <div
        className="flex w-full flex-col gap-3 rounded-t-3xl bg-white p-4 pb-[calc(1rem+env(safe-area-inset-bottom))] shadow-lg sm:max-w-md sm:rounded-3xl dark:bg-stone-900"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <h2 className="text-base font-bold text-stone-800 dark:text-stone-100">הוספת &quot;{name}&quot;</h2>
            <p className="text-xs text-stone-500 dark:text-stone-400">לאיזו קטגוריה זה שייך? לחיצה אחת מוסיפה לרשימה.</p>
          </div>
          <button type="button" onClick={onClose} aria-label="סגירה" className="shrink-0 rounded-full p-1.5 text-stone-400 hover:bg-stone-100 dark:hover:bg-stone-800">
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="grid grid-cols-2 gap-2">
          {SHOPPING_CATEGORIES.map((category) => {
            const suggested = category === suggestedCategory;
            return (
              <button
                key={category}
                type="button"
                onClick={() => onConfirm(category, save)}
                className={`min-h-[48px] rounded-xl border px-2 py-2 text-sm font-medium transition-colors active:scale-[0.98] ${
                  suggested
                    ? "border-amber-500 bg-amber-500 text-white"
                    : "border-amber-200 bg-white text-stone-700 hover:bg-amber-50 dark:border-amber-900/50 dark:bg-stone-900 dark:text-stone-200 dark:hover:bg-stone-800"
                }`}
              >
                {category}
                {suggested && <span className="block text-[10px] font-normal opacity-80">מומלץ</span>}
              </button>
            );
          })}
        </div>

        <label className="flex cursor-pointer items-center gap-2 rounded-xl bg-stone-50 px-3 py-2.5 text-sm text-stone-700 dark:bg-stone-800 dark:text-stone-200">
          <input type="checkbox" checked={save} onChange={(event) => setSave(event.target.checked)} className="h-4 w-4" />
          שמור גם במאגר המוצרים הקבועים (לפעם הבאה)
        </label>
      </div>
    </div>
  );
}

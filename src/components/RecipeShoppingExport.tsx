"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { ShoppingCart, X } from "lucide-react";
import { useSupabaseTable } from "@/lib/useSupabaseTable";
import { upsertShoppingItem } from "@/lib/shoppingActions";
import { friendlyErrorMessage } from "@/lib/supabaseErrors";
import { guessShoppingCategory } from "@/lib/shoppingCategoryGuess";
import { findExactProductMatch } from "@/lib/shoppingMatch";
import { OTHER_CATEGORY, type MasterProduct } from "@/lib/shoppingData";
import { ingredientToShoppingItem } from "@/lib/recipeData";

/**
 * "Export to the shopping list": every ingredient is ticked; untick what's already at home, then
 * add the rest straight to the list (known products keep their category, new ones get a guessed one).
 */
export default function RecipeShoppingExport({
  title,
  ingredients,
  onClose,
}: {
  title: string;
  /** The ingredient lines as shown (already scaled to the chosen portions). */
  ingredients: string[];
  onClose: () => void;
}) {
  const { rows: products } = useSupabaseTable<MasterProduct>("master_products", "*", { column: "name", ascending: true });
  const lines = useMemo(() => ingredients.filter((line) => line.trim() && !/:\s*$/.test(line)), [ingredients]);
  const [checked, setChecked] = useState<boolean[]>(() => lines.map(() => true));
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<{ added: number; failed: string[] } | null>(null);

  const selectedCount = checked.filter(Boolean).length;

  async function handleAdd() {
    setBusy(true);
    let added = 0;
    const failed: string[] = [];
    for (let index = 0; index < lines.length; index++) {
      if (!checked[index]) continue;
      const parsed = ingredientToShoppingItem(lines[index]);
      const product =
        findExactProductMatch(products, parsed.name) ??
        products.find((candidate) => candidate.name.trim().length >= 3 && parsed.name.includes(candidate.name.trim())) ??
        null;
      const { error } = await upsertShoppingItem(
        product
          ? { productId: product.id, title: product.name, category: product.category, qty: parsed.count }
          : {
              productId: null,
              title: parsed.amountText ? `${parsed.name} (${parsed.amountText})` : parsed.name,
              category: guessShoppingCategory(parsed.name, products) ?? OTHER_CATEGORY,
              qty: parsed.count,
            }
      );
      if (error) failed.push(`${parsed.name}: ${friendlyErrorMessage(error)}`);
      else added++;
    }
    setResult({ added, failed });
    setBusy(false);
  }

  return (
    <div className="fixed inset-0 z-[60] flex items-end justify-center bg-black/40 sm:items-center">
      <div className="flex max-h-[88dvh] w-full flex-col overflow-hidden rounded-t-3xl bg-white shadow-lg sm:max-w-md sm:rounded-3xl dark:bg-stone-900">
        <div className="flex shrink-0 items-center justify-between border-b border-amber-100 p-4 dark:border-amber-950/30">
          <div className="min-w-0">
            <h2 className="flex items-center gap-2 text-base font-bold text-stone-800 dark:text-stone-100">
              <ShoppingCart className="h-5 w-5 text-amber-500" />
              ייצוא לרשימת קניות
            </h2>
            <p className="truncate text-xs text-stone-400">{title}</p>
          </div>
          <button type="button" onClick={onClose} aria-label="סגירה" className="rounded-full p-1.5 text-stone-400 hover:bg-stone-100 dark:hover:bg-stone-800">
            <X className="h-5 w-5" />
          </button>
        </div>

        {result ? (
          <div className="flex flex-col gap-3 p-4">
            <p className="text-sm font-semibold text-emerald-700 dark:text-emerald-400">✓ נוספו {result.added} מצרכים לרשימת הקניות</p>
            {result.failed.length > 0 && (
              <ul className="rounded-xl bg-rose-50 p-3 text-xs text-rose-700 dark:bg-rose-950/30 dark:text-rose-300">
                {result.failed.map((line) => (
                  <li key={line}>{line}</li>
                ))}
              </ul>
            )}
            <div className="flex gap-2">
              <Link href="/shopping" className="flex-1 rounded-xl bg-amber-500 px-4 py-3 text-center text-sm font-semibold text-white hover:bg-amber-600">
                לרשימת הקניות
              </Link>
              <button type="button" onClick={onClose} className="rounded-xl border border-stone-200 px-4 py-3 text-sm font-medium text-stone-600 dark:border-stone-700 dark:text-stone-300">
                סגירה
              </button>
            </div>
          </div>
        ) : (
          <>
            <div className="flex shrink-0 items-center justify-between px-4 pt-3 text-xs text-stone-500 dark:text-stone-400">
              <span>הסירו את מה שכבר יש בבית</span>
              <button
                type="button"
                onClick={() => setChecked(lines.map(() => selectedCount !== lines.length))}
                className="font-medium text-amber-600 hover:underline dark:text-amber-400"
              >
                {selectedCount === lines.length ? "בטל הכול" : "סמן הכול"}
              </button>
            </div>
            <ul className="flex-1 divide-y divide-stone-100 overflow-y-auto px-4 py-2 dark:divide-stone-800">
              {lines.map((line, index) => (
                <li key={`${index}-${line}`}>
                  <label className="flex min-h-[48px] cursor-pointer items-center gap-3 py-2 text-sm text-stone-800 dark:text-stone-100">
                    <input
                      type="checkbox"
                      checked={checked[index] ?? false}
                      onChange={(event) => setChecked((current) => current.map((value, i) => (i === index ? event.target.checked : value)))}
                      className="h-5 w-5 shrink-0 accent-amber-500"
                    />
                    <span className={checked[index] ? "" : "text-stone-400 line-through"}>{line}</span>
                  </label>
                </li>
              ))}
            </ul>
            <div className="shrink-0 border-t border-amber-100 p-4 pb-[calc(1rem+env(safe-area-inset-bottom))] dark:border-amber-950/30">
              <button
                type="button"
                onClick={() => void handleAdd()}
                disabled={busy || selectedCount === 0}
                className="w-full rounded-xl bg-amber-500 px-4 py-3 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-amber-600 disabled:opacity-50"
              >
                {busy ? "מוסיף..." : `הוסף לקניות (${selectedCount})`}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

"use client";

import { useState, type FormEvent } from "react";
import { Check, Plus } from "lucide-react";
import { useSupabaseTable } from "@/lib/useSupabaseTable";
import { supabase } from "@/lib/supabaseClient";
import { friendlyErrorMessage, logSupabaseError } from "@/lib/supabaseErrors";
import ErrorBanner from "@/components/ErrorBanner";
import {
  groupByCategory,
  SHOPPING_CATEGORIES,
  type MasterProduct,
  type ShoppingItem,
} from "@/lib/shoppingData";

export default function ShoppingArsenal() {
  const { rows: products, refetch: refetchProducts } = useSupabaseTable<MasterProduct>(
    "master_products",
    "*",
    { column: "name", ascending: true }
  );
  const { rows: shoppingItems, refetch: refetchShopping } = useSupabaseTable<ShoppingItem>("shopping");

  const [newName, setNewName] = useState("");
  const [newCategory, setNewCategory] = useState<string>(SHOPPING_CATEGORIES[0]);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const grouped = groupByCategory(products);

  function getActiveItem(product: MasterProduct) {
    return shoppingItems.find(
      (item) => item.product_id === product.id && item.in_cart && !item.completed
    );
  }

  async function toggleProduct(product: MasterProduct) {
    setError(null);
    const activeItem = getActiveItem(product);

    if (activeItem) {
      const { error: err } = await supabase.from("shopping").delete().eq("id", activeItem.id);
      if (err) {
        logSupabaseError("הסרת פריט מהרשימה", err);
        setError(friendlyErrorMessage(err));
        return;
      }
      refetchShopping();
      return;
    }

    const { error: err } = await supabase.from("shopping").insert({
      product_id: product.id,
      title: product.name,
      category: product.category,
      added_by: "Shared",
    });
    if (err) {
      logSupabaseError("הוספת פריט מהארסנל", err);
      setError(friendlyErrorMessage(err));
      return;
    }
    refetchShopping();
  }

  async function handleAddProduct(event: FormEvent) {
    event.preventDefault();
    const trimmed = newName.trim();
    if (!trimmed || submitting) return;
    setSubmitting(true);
    setError(null);
    const { error: err } = await supabase
      .from("master_products")
      .insert({ name: trimmed, category: newCategory });
    if (err) {
      logSupabaseError("הוספת מוצר לארסנל", err);
      setError(friendlyErrorMessage(err));
      setSubmitting(false);
      return;
    }
    setNewName("");
    await refetchProducts();
    setSubmitting(false);
  }

  return (
    <div className="flex flex-col gap-4">
      {error && <ErrorBanner message={error} onDismiss={() => setError(null)} />}

      <form
        onSubmit={handleAddProduct}
        className="flex flex-col gap-2 rounded-2xl border border-amber-100 bg-white p-3 shadow-sm dark:border-amber-950/30 dark:bg-stone-900"
      >
        <p className="text-xs font-medium text-stone-500 dark:text-stone-400">הוספת מוצר חדש לארסנל</p>
        <div className="flex gap-2">
          <input
            type="text"
            value={newName}
            onChange={(event) => setNewName(event.target.value)}
            placeholder="שם המוצר..."
            className="min-w-0 flex-1 rounded-xl border border-amber-200 bg-white px-3 py-2 text-sm text-stone-700 outline-none focus:border-amber-400 dark:border-amber-900/50 dark:bg-stone-950 dark:text-stone-200"
          />
          <select
            value={newCategory}
            onChange={(event) => setNewCategory(event.target.value)}
            className="rounded-xl border border-amber-200 bg-white px-2 py-2 text-sm text-stone-700 outline-none focus:border-amber-400 dark:border-amber-900/50 dark:bg-stone-950 dark:text-stone-200"
          >
            {SHOPPING_CATEGORIES.map((category) => (
              <option key={category} value={category}>
                {category}
              </option>
            ))}
          </select>
          <button
            type="submit"
            disabled={!newName.trim() || submitting}
            aria-label="הוספה לארסנל"
            className="flex shrink-0 items-center gap-1 rounded-xl bg-amber-500 px-3 py-2 text-sm font-medium text-white transition-colors hover:bg-amber-600 disabled:opacity-50"
          >
            <Plus className="h-4 w-4" />
          </button>
        </div>
      </form>

      {grouped.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-amber-200 p-8 text-center text-sm text-stone-500 dark:border-amber-900/40 dark:text-stone-400">
          הארסנל ריק. הוסיפו מוצר ראשון למעלה!
        </div>
      ) : (
        grouped.map(({ category, items }) => (
          <div key={category} className="flex flex-col gap-2">
            <h3 className="text-sm font-bold text-stone-700 dark:text-stone-200">{category}</h3>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
              {items.map((product) => {
                const active = Boolean(getActiveItem(product));
                return (
                  <button
                    key={product.id}
                    type="button"
                    onClick={() => toggleProduct(product)}
                    className={`flex items-center justify-between gap-2 rounded-xl border px-3 py-2 text-sm transition-colors ${
                      active
                        ? "border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-900/40 dark:bg-emerald-950/30 dark:text-emerald-400"
                        : "border-amber-100 bg-white text-stone-700 hover:bg-amber-50 dark:border-amber-950/30 dark:bg-stone-900 dark:text-stone-200 dark:hover:bg-stone-800"
                    }`}
                  >
                    <span className="truncate">{product.name}</span>
                    {active ? (
                      <Check className="h-4 w-4 shrink-0" />
                    ) : (
                      <Plus className="h-4 w-4 shrink-0 text-amber-500" />
                    )}
                  </button>
                );
              })}
            </div>
          </div>
        ))
      )}
    </div>
  );
}

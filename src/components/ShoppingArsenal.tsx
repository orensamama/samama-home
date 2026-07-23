"use client";

import { useMemo, useState, type FormEvent } from "react";
import { Check, Minus, Pencil, Plus, Search, Trash2, X } from "lucide-react";
import { useSupabaseTable } from "@/lib/useSupabaseTable";
import { useOptimisticRows } from "@/lib/useOptimisticRows";
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
  const optimisticShopping = useOptimisticRows(shoppingItems);

  const [newName, setNewName] = useState("");
  const [newCategory, setNewCategory] = useState<string>(SHOPPING_CATEGORIES[0]);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [editMode, setEditMode] = useState(false);
  const [renamingCategory, setRenamingCategory] = useState<string | null>(null);
  const [search, setSearch] = useState("");

  // Map lookup instead of an .find() per product per render.
  const activeByProductId = useMemo(() => {
    const map = new Map<string, ShoppingItem>();
    for (const item of optimisticShopping.rows) {
      if (item.product_id && item.in_cart && !item.completed) {
        map.set(item.product_id, item);
      }
    }
    return map;
  }, [optimisticShopping.rows]);

  const filteredProducts = useMemo(() => {
    const query = search.trim().toLowerCase();
    if (!query) return products;
    return products.filter((product) => product.name.toLowerCase().includes(query));
  }, [products, search]);

  const grouped = useMemo(() => groupByCategory(filteredProducts), [filteredProducts]);
  const noSearchResults = search.trim().length > 0 && filteredProducts.length === 0;

  async function addProduct(product: MasterProduct) {
    setError(null);
    const { error: err } = await supabase.from("shopping").insert({
      product_id: product.id,
      title: product.name,
      category: product.category,
      qty: product.default_qty,
      added_by: "Shared",
    });
    if (err) {
      logSupabaseError("הוספת פריט מהארסנל", err);
      setError(friendlyErrorMessage(err));
      return;
    }
    refetchShopping();
  }

  async function changeQty(item: ShoppingItem, delta: number) {
    setError(null);
    const nextQty = item.qty + delta;

    if (nextQty <= 0) {
      optimisticShopping.remove(item.id);
      const { error: err } = await supabase.from("shopping").delete().eq("id", item.id);
      if (err) {
        logSupabaseError("הסרת פריט מהרשימה", err);
        setError(friendlyErrorMessage(err));
        optimisticShopping.reset();
        return;
      }
      refetchShopping();
      return;
    }

    optimisticShopping.patch(item.id, { qty: nextQty });
    const { error: err } = await supabase.from("shopping").update({ qty: nextQty }).eq("id", item.id);
    if (err) {
      logSupabaseError("עדכון כמות", err);
      setError(friendlyErrorMessage(err));
      optimisticShopping.reset();
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

  async function handleRenameProduct(product: MasterProduct, newNameRaw: string) {
    const trimmed = newNameRaw.trim();
    if (!trimmed || trimmed === product.name) return;
    setError(null);
    const { error: err } = await supabase
      .from("master_products")
      .update({ name: trimmed })
      .eq("id", product.id);
    if (err) {
      logSupabaseError("עדכון שם מוצר", err);
      setError(friendlyErrorMessage(err));
      return;
    }
    refetchProducts();
  }

  async function handleDeleteProduct(id: string) {
    setError(null);
    const { error: err } = await supabase.from("master_products").delete().eq("id", id);
    if (err) {
      logSupabaseError("מחיקת מוצר מהארסנל", err);
      setError(friendlyErrorMessage(err));
      return;
    }
    refetchProducts();
  }

  async function handleRenameCategory(oldName: string, newNameRaw: string) {
    const newName = newNameRaw.trim();
    setRenamingCategory(null);
    if (!newName || newName === oldName) return;
    setError(null);
    const { error: err } = await supabase
      .from("master_products")
      .update({ category: newName })
      .eq("category", oldName);
    if (err) {
      logSupabaseError("שינוי שם קטגוריה", err);
      setError(friendlyErrorMessage(err));
      return;
    }
    refetchProducts();
  }

  return (
    <div className="flex flex-col gap-4">
      {error && <ErrorBanner message={error} onDismiss={() => setError(null)} />}

      <div className="flex items-center justify-between">
        <p className="text-sm font-bold text-stone-700 dark:text-stone-200">ארסנל מוצרים</p>
        <button
          type="button"
          onClick={() => {
            setEditMode((value) => !value);
            setRenamingCategory(null);
          }}
          className={`flex items-center gap-1 rounded-lg px-2.5 py-1.5 text-xs font-medium transition-colors ${
            editMode
              ? "bg-amber-500 text-white hover:bg-amber-600"
              : "border border-amber-200 text-amber-700 hover:bg-amber-50 dark:border-amber-900/50 dark:text-amber-400 dark:hover:bg-stone-800"
          }`}
        >
          {editMode ? <Check className="h-3.5 w-3.5" /> : <Pencil className="h-3.5 w-3.5" />}
          {editMode ? "סיום" : "עריכה"}
        </button>
      </div>

      <div className="relative">
        <Search className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-stone-400" />
        <input
          type="text"
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          placeholder="חיפוש מוצר בארסנל..."
          className="w-full rounded-xl border border-amber-200 bg-white py-2.5 pe-9 ps-3 text-sm text-stone-700 outline-none focus:border-amber-400 dark:border-amber-900/50 dark:bg-stone-900 dark:text-stone-200"
        />
        {search && (
          <button
            type="button"
            onClick={() => setSearch("")}
            aria-label="ניקוי חיפוש"
            className="absolute left-2 top-1/2 -translate-y-1/2 rounded-full p-1 text-stone-400 hover:bg-amber-100 hover:text-amber-600 dark:hover:bg-stone-800"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        )}
      </div>

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

      {products.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-amber-200 p-8 text-center text-sm text-stone-500 dark:border-amber-900/40 dark:text-stone-400">
          הארסנל ריק. הוסיפו מוצר ראשון למעלה!
        </div>
      ) : noSearchResults ? (
        <div className="rounded-2xl border border-dashed border-amber-200 p-8 text-center text-sm text-stone-500 dark:border-amber-900/40 dark:text-stone-400">
          לא נמצאו מוצרים התואמים לחיפוש &quot;{search.trim()}&quot;
        </div>
      ) : (
        grouped.map(({ category, items }) => (
          <div key={category} className="flex flex-col gap-2">
            <div className="flex items-center justify-between gap-2">
              {renamingCategory === category ? (
                <input
                  type="text"
                  defaultValue={category}
                  autoFocus
                  onBlur={(event) => handleRenameCategory(category, event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === "Enter") event.currentTarget.blur();
                  }}
                  className="min-w-0 flex-1 rounded-lg border border-amber-300 bg-white px-2 py-1 text-sm font-bold text-stone-700 outline-none dark:bg-stone-950 dark:text-stone-200"
                />
              ) : (
                <h3 className="text-sm font-bold text-stone-700 dark:text-stone-200">{category}</h3>
              )}
              {editMode && renamingCategory !== category && (
                <button
                  type="button"
                  onClick={() => setRenamingCategory(category)}
                  aria-label="שינוי שם קטגוריה"
                  className="shrink-0 rounded-full p-1 text-stone-400 hover:bg-amber-100 hover:text-amber-600 dark:hover:bg-amber-950/40 dark:hover:text-amber-400"
                >
                  <Pencil className="h-3.5 w-3.5" />
                </button>
              )}
            </div>

            {editMode ? (
              <div className="flex flex-col gap-1.5">
                {items.map((product) => (
                  <div
                    key={product.id}
                    className="flex items-center gap-2 rounded-xl border border-stone-200 bg-white px-2.5 py-1.5 dark:border-stone-700 dark:bg-stone-900"
                  >
                    <input
                      type="text"
                      defaultValue={product.name}
                      onBlur={(event) => handleRenameProduct(product, event.target.value)}
                      onKeyDown={(event) => {
                        if (event.key === "Enter") event.currentTarget.blur();
                      }}
                      className="min-w-0 flex-1 bg-transparent text-sm text-stone-700 outline-none dark:text-stone-200"
                    />
                    <button
                      type="button"
                      onClick={() => handleDeleteProduct(product.id)}
                      aria-label="מחיקת מוצר"
                      className="shrink-0 rounded-full p-1 text-stone-400 hover:bg-red-50 hover:text-red-500 dark:hover:bg-red-950/30"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </div>
                ))}
              </div>
            ) : (
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                {items.map((product) => {
                  const activeItem = activeByProductId.get(product.id);
                  return (
                    <div
                      key={product.id}
                      className={`flex items-center justify-between gap-2 rounded-xl border px-2.5 py-2 text-sm transition-colors ${
                        activeItem
                          ? "border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-900/40 dark:bg-emerald-950/30 dark:text-emerald-400"
                          : "border-amber-100 bg-white text-stone-700 dark:border-amber-950/30 dark:bg-stone-900 dark:text-stone-200"
                      }`}
                    >
                      {activeItem ? (
                        <>
                          <span className="min-w-0 flex-1 truncate">{product.name}</span>
                          <div className="flex shrink-0 items-center gap-1">
                            <button
                              type="button"
                              onClick={() => changeQty(activeItem, -1)}
                              aria-label="הפחתת כמות"
                              className="flex h-6 w-6 items-center justify-center rounded-full bg-white text-emerald-700 shadow-sm transition-colors hover:bg-emerald-100 dark:bg-stone-800 dark:text-emerald-400 dark:hover:bg-stone-700"
                            >
                              <Minus className="h-3 w-3" />
                            </button>
                            <span className="w-4 text-center text-sm font-semibold tabular-nums">
                              {activeItem.qty}
                            </span>
                            <button
                              type="button"
                              onClick={() => changeQty(activeItem, 1)}
                              aria-label="הוספת כמות"
                              className="flex h-6 w-6 items-center justify-center rounded-full bg-white text-emerald-700 shadow-sm transition-colors hover:bg-emerald-100 dark:bg-stone-800 dark:text-emerald-400 dark:hover:bg-stone-700"
                            >
                              <Plus className="h-3 w-3" />
                            </button>
                          </div>
                        </>
                      ) : (
                        <button
                          type="button"
                          onClick={() => addProduct(product)}
                          className="flex w-full items-center justify-between gap-2 hover:text-amber-700 dark:hover:text-amber-400"
                        >
                          <span className="truncate">{product.name}</span>
                          <Plus className="h-4 w-4 shrink-0 text-amber-500" />
                        </button>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        ))
      )}
    </div>
  );
}

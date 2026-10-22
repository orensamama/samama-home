"use client";

import { useMemo, useState } from "react";
import { Check, PackageX, Search, ShoppingCart, X } from "lucide-react";
import PageHeader from "@/components/PageHeader";
import ErrorBanner from "@/components/ErrorBanner";
import { SkeletonList } from "@/components/Skeleton";
import { useSupabaseTable } from "@/lib/useSupabaseTable";
import { useOptimisticRows } from "@/lib/useOptimisticRows";
import { supabase } from "@/lib/supabaseClient";
import { friendlyErrorMessage, logSupabaseError } from "@/lib/supabaseErrors";
import { upsertShoppingItem } from "@/lib/shoppingActions";
import { enqueue, isNetworkError, runWithQueueFallback } from "@/lib/syncQueue";
import { findExistingShoppingItem } from "@/lib/shoppingMatch";
import { groupByCategory, type MasterProduct, type ShoppingItem } from "@/lib/shoppingData";

type Filter = "all" | "in" | "out";

const FILTERS: { value: Filter; label: string }[] = [
  { value: "all", label: "הכל" },
  { value: "in", label: "יש בבית" },
  { value: "out", label: "נגמר" },
];

const isInStock = (product: MasterProduct) => product.in_stock !== false;

export default function InventoryPage() {
  // Same table+select+orderBy as the Arsenal / live list, so these share one
  // cached fetch with the shopping screens instead of each re-querying.
  const {
    rows: serverProducts,
    loading,
    refetch: refetchProducts,
  } = useSupabaseTable<MasterProduct>("master_products", "*", { column: "name", ascending: true });
  const { rows: shoppingItems, refetch: refetchShopping } = useSupabaseTable<ShoppingItem>("shopping", "*", {
    column: "created_at",
    ascending: true,
  });
  const products = useOptimisticRows(serverProducts);

  const [filter, setFilter] = useState<Filter>("all");
  const [search, setSearch] = useState("");
  const [error, setError] = useState<string | null>(null);

  const activeProductIds = useMemo(() => {
    const ids = new Set<string>();
    for (const item of shoppingItems) {
      if (item.product_id && item.in_cart && !item.completed) ids.add(item.product_id);
    }
    return ids;
  }, [shoppingItems]);

  const outCount = useMemo(() => products.rows.filter((product) => !isInStock(product)).length, [products.rows]);
  const inCount = products.rows.length - outCount;

  const visible = useMemo(() => {
    const query = search.trim().toLowerCase();
    return products.rows.filter((product) => {
      if (filter === "in" && !isInStock(product)) return false;
      if (filter === "out" && isInStock(product)) return false;
      return !query || product.name.toLowerCase().includes(query);
    });
  }, [products.rows, filter, search]);

  const grouped = useMemo(() => groupByCategory(visible), [visible]);

  async function addToShoppingList(product: MasterProduct) {
    // Already waiting on the list -- don't stack a second copy/quantity.
    if (findExistingShoppingItem(product, product.name, shoppingItems)) return;

    const { error: err } = await upsertShoppingItem({
      productId: product.id,
      title: product.name,
      category: product.category,
      qty: product.default_qty,
    });
    if (err) {
      if (isNetworkError(err)) {
        enqueue({
          kind: "rpc",
          fn: "upsert_shopping_item",
          args: {
            p_product_id: product.id,
            p_title: product.name,
            p_category: product.category,
            p_qty: product.default_qty,
            p_added_by: "Shared",
          },
        });
        return;
      }
      logSupabaseError("הוספת מוצר שנגמר לרשימת הקניות", err);
      setError(friendlyErrorMessage(err));
      return;
    }
    refetchShopping();
  }

  async function setStock(product: MasterProduct, inStock: boolean) {
    setError(null);
    products.patch(product.id, { in_stock: inStock });
    const { queued, error: err } = await runWithQueueFallback(
      { kind: "update", table: "master_products", match: { id: product.id }, values: { in_stock: inStock } },
      () => supabase.from("master_products").update({ in_stock: inStock }).eq("id", product.id)
    );
    if (err) {
      logSupabaseError("עדכון סטטוס מלאי", err);
      setError(friendlyErrorMessage(err));
      products.reset();
      return;
    }
    // Out of stock => straight onto the live shopping list.
    if (!inStock) await addToShoppingList(product);
    if (!queued) refetchProducts();
  }

  return (
    <div className="flex min-h-full flex-col">
      <PageHeader title="מלאי ביתי" subtitle="מה יש בבית ומה נגמר" />

      <div className="flex flex-col gap-3 p-4">
        {error && <ErrorBanner message={error} onDismiss={() => setError(null)} />}

        <div className="grid grid-cols-2 gap-3">
          <div className="flex flex-col gap-0.5 rounded-2xl border border-emerald-100 bg-emerald-50/70 p-3 dark:border-emerald-950/30 dark:bg-emerald-950/20">
            <span className="flex items-center gap-1 text-xs font-medium text-emerald-700 dark:text-emerald-400">
              <Check className="h-3.5 w-3.5" />
              יש בבית
            </span>
            <span className="text-2xl font-bold text-emerald-800 dark:text-emerald-300">{inCount}</span>
          </div>
          <div className="flex flex-col gap-0.5 rounded-2xl border border-rose-100 bg-rose-50/70 p-3 dark:border-rose-950/30 dark:bg-rose-950/20">
            <span className="flex items-center gap-1 text-xs font-medium text-rose-700 dark:text-rose-400">
              <PackageX className="h-3.5 w-3.5" />
              נגמר
            </span>
            <span className="text-2xl font-bold text-rose-800 dark:text-rose-300">{outCount}</span>
          </div>
        </div>

        <p className="text-xs text-stone-500 dark:text-stone-400">
          סימון מוצר כ&quot;נגמר&quot; מוסיף אותו אוטומטית לרשימת הקניות; כשתסמנו אותו כנקנה בסופר הוא יחזור
          ל&quot;יש בבית&quot;.
        </p>

        <div className="grid grid-cols-3 gap-1.5 rounded-2xl bg-amber-50 p-1 dark:bg-stone-900">
          {FILTERS.map((option) => (
            <button
              key={option.value}
              type="button"
              onClick={() => setFilter(option.value)}
              className={`rounded-xl px-2 py-1.5 text-sm font-medium transition-colors ${
                filter === option.value
                  ? "bg-white text-amber-700 shadow-sm dark:bg-stone-800 dark:text-amber-400"
                  : "text-stone-500 dark:text-stone-400"
              }`}
            >
              {option.label}
            </button>
          ))}
        </div>

        <div className="relative">
          <Search className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-stone-400" />
          <input
            type="text"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="חיפוש מוצר..."
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

        {loading && products.rows.length === 0 ? (
          <SkeletonList count={5} itemClassName="h-12" />
        ) : products.rows.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-amber-200 p-8 text-center text-sm text-stone-500 dark:border-amber-900/40 dark:text-stone-400">
            אין עדיין מוצרים. המלאי נבנה מארסנל המוצרים - הוסיפו מוצרים במסך הקניות.
          </div>
        ) : grouped.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-amber-200 p-8 text-center text-sm text-stone-500 dark:border-amber-900/40 dark:text-stone-400">
            {filter === "out" && !search.trim() ? "הכל במלאי - שום דבר לא נגמר 🎉" : "לא נמצאו מוצרים."}
          </div>
        ) : (
          grouped.map(({ category, items }) => {
            const outInCategory = items.filter((product) => !isInStock(product)).length;
            return (
              <div key={category} className="flex flex-col gap-1.5">
                <div className="flex items-center justify-between">
                  <h3 className="text-sm font-bold text-stone-700 dark:text-stone-200">{category}</h3>
                  {outInCategory > 0 && (
                    <span className="rounded-full bg-rose-100 px-2 py-0.5 text-[11px] font-medium text-rose-700 dark:bg-rose-950/40 dark:text-rose-400">
                      {outInCategory} נגמרו
                    </span>
                  )}
                </div>
                <ul className="flex flex-col gap-1.5">
                  {items.map((product) => {
                    const inStock = isInStock(product);
                    return (
                      <li
                        key={product.id}
                        className={`flex items-center gap-2 rounded-xl border px-3 py-2 transition-colors ${
                          inStock
                            ? "border-amber-100 bg-white dark:border-amber-950/30 dark:bg-stone-900"
                            : "border-rose-200 bg-rose-50/60 dark:border-rose-900/40 dark:bg-rose-950/20"
                        }`}
                      >
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-sm font-medium text-stone-800 dark:text-stone-100">
                            {product.name}
                          </span>
                          {!inStock && activeProductIds.has(product.id) && (
                            <span className="flex items-center gap-1 text-[11px] text-amber-700 dark:text-amber-400">
                              <ShoppingCart className="h-3 w-3" />
                              ברשימת הקניות
                            </span>
                          )}
                        </span>
                        <button
                          type="button"
                          onClick={() => setStock(product, !inStock)}
                          aria-label={inStock ? `סמן ${product.name} כנגמר` : `סמן ${product.name} כיש בבית`}
                          className={`flex shrink-0 items-center gap-1 rounded-full px-3 py-1.5 text-xs font-semibold transition-colors ${
                            inStock
                              ? "bg-emerald-100 text-emerald-700 hover:bg-emerald-200 dark:bg-emerald-950/40 dark:text-emerald-400 dark:hover:bg-emerald-950/60"
                              : "bg-rose-500 text-white hover:bg-rose-600"
                          }`}
                        >
                          {inStock ? (
                            <>
                              <Check className="h-3.5 w-3.5" />
                              יש בבית
                            </>
                          ) : (
                            <>
                              <PackageX className="h-3.5 w-3.5" />
                              נגמר
                            </>
                          )}
                        </button>
                      </li>
                    );
                  })}
                </ul>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}

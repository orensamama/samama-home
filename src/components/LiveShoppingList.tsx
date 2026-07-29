"use client";

import { useMemo, useState, type FormEvent } from "react";
import { Check, Minus, Plus, Trash2 } from "lucide-react";
import { useSupabaseTable } from "@/lib/useSupabaseTable";
import { useOptimisticRows } from "@/lib/useOptimisticRows";
import { upsertShoppingItem } from "@/lib/shoppingActions";
import { enqueue, isNetworkError, runWithQueueFallback } from "@/lib/syncQueue";
import { findExistingShoppingItem } from "@/lib/shoppingMatch";
import { supabase } from "@/lib/supabaseClient";
import { friendlyErrorMessage, logSupabaseError } from "@/lib/supabaseErrors";
import ErrorBanner from "@/components/ErrorBanner";
import ShareMenu from "@/components/ShareMenu";
import { SkeletonList } from "@/components/Skeleton";
import { formatShoppingListForShare, groupByCategory, type ShoppingItem } from "@/lib/shoppingData";

export default function LiveShoppingList() {
  const { rows: serverItems, loading, refetch } = useSupabaseTable<ShoppingItem>("shopping", "*", {
    column: "created_at",
    ascending: true,
  });
  const optimistic = useOptimisticRows(serverItems);
  const items = optimistic.rows;
  const [newTitle, setNewTitle] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const activeItems = items.filter((item) => item.in_cart);
  const pending = activeItems.filter((item) => !item.completed);
  const completed = activeItems.filter((item) => item.completed);
  const grouped = useMemo(() => groupByCategory(pending), [pending]);
  const shareText = useMemo(() => formatShoppingListForShare(grouped), [grouped]);

  async function toggleCompleted(item: ShoppingItem) {
    setError(null);
    const nextCompleted = !item.completed;
    optimistic.patch(item.id, { completed: nextCompleted });
    const { queued, error: err } = await runWithQueueFallback(
      { kind: "update", table: "shopping", match: { id: item.id }, values: { completed: nextCompleted } },
      () => supabase.from("shopping").update({ completed: nextCompleted }).eq("id", item.id)
    );
    if (err) {
      logSupabaseError("סימון פריט קניות", err);
      setError(friendlyErrorMessage(err));
      optimistic.reset();
      return;
    }
    if (!queued) refetch();
  }

  async function changeQty(item: ShoppingItem, delta: number) {
    setError(null);
    const nextQty = item.qty + delta;

    if (nextQty <= 0) {
      optimistic.remove(item.id);
      const { queued, error: err } = await runWithQueueFallback(
        { kind: "delete", table: "shopping", match: { id: item.id } },
        () => supabase.from("shopping").delete().eq("id", item.id)
      );
      if (err) {
        logSupabaseError("הסרת פריט מהרשימה", err);
        setError(friendlyErrorMessage(err));
        optimistic.reset();
        return;
      }
      if (!queued) refetch();
      return;
    }

    optimistic.patch(item.id, { qty: nextQty });
    const { queued, error: err } = await runWithQueueFallback(
      { kind: "update", table: "shopping", match: { id: item.id }, values: { qty: nextQty } },
      () => supabase.from("shopping").update({ qty: nextQty }).eq("id", item.id)
    );
    if (err) {
      logSupabaseError("עדכון כמות", err);
      setError(friendlyErrorMessage(err));
      optimistic.reset();
      return;
    }
    if (!queued) refetch();
  }

  async function handleAdd(event: FormEvent) {
    event.preventDefault();
    const trimmed = newTitle.trim();
    if (!trimmed || submitting) return;
    setSubmitting(true);
    setError(null);

    // Merges into an existing active row with the same title instead of
    // inserting a duplicate line (e.g. re-typing the same quick-add item).
    const { data, error: err } = await upsertShoppingItem({ productId: null, title: trimmed, category: null, qty: 1 });
    if (err) {
      if (isNetworkError(err)) {
        // Offline: apply a best-effort local guess now (merge into a
        // matching row if we can already see one, otherwise a new temp
        // row), and queue the *same* upsert RPC so the server does the
        // real, authoritative merge-or-create once back online.
        const existing = findExistingShoppingItem(null, trimmed, optimistic.rows);
        if (existing) {
          optimistic.patch(existing.id, { qty: existing.qty + 1 });
        } else {
          optimistic.add({
            id: `temp-${crypto.randomUUID()}`,
            product_id: null,
            title: trimmed,
            category: null,
            completed: false,
            in_cart: true,
            qty: 1,
          });
        }
        enqueue({
          kind: "rpc",
          fn: "upsert_shopping_item",
          args: { p_product_id: null, p_title: trimmed, p_category: null, p_qty: 1, p_added_by: "Shared" },
        });
      } else {
        logSupabaseError("הוספת פריט קניות", err);
        setError(friendlyErrorMessage(err));
        setSubmitting(false);
        return;
      }
    } else {
      if (data) optimistic.upsert(data);
      await refetch();
    }
    setNewTitle("");
    setSubmitting(false);
  }

  async function remove(id: string) {
    setError(null);
    optimistic.remove(id);
    const { queued, error: err } = await runWithQueueFallback(
      { kind: "delete", table: "shopping", match: { id } },
      () => supabase.from("shopping").delete().eq("id", id)
    );
    if (err) {
      logSupabaseError("מחיקת פריט קניות", err);
      setError(friendlyErrorMessage(err));
      optimistic.reset();
      return;
    }
    if (!queued) refetch();
  }

  async function clearCompleted() {
    const ids = completed.map((item) => item.id);
    if (ids.length === 0) return;
    setError(null);
    for (const id of ids) optimistic.patch(id, { in_cart: false });
    const { error: err } = await supabase.from("shopping").update({ in_cart: false }).in("id", ids);
    if (err) {
      if (isNetworkError(err)) {
        for (const id of ids) {
          enqueue({ kind: "update", table: "shopping", match: { id }, values: { in_cart: false } });
        }
      } else {
        logSupabaseError("ניקוי פריטים שנקנו", err);
        setError(friendlyErrorMessage(err));
        optimistic.reset();
        return;
      }
    } else {
      refetch();
    }
  }

  return (
    <div className="flex flex-col gap-4">
      {error && <ErrorBanner message={error} onDismiss={() => setError(null)} />}

      <form onSubmit={handleAdd} className="flex gap-2">
        <input
          type="text"
          value={newTitle}
          onChange={(event) => setNewTitle(event.target.value)}
          placeholder="פריט מהיר..."
          className="min-w-0 flex-1 rounded-xl border border-amber-200 bg-white px-3 py-3 text-base text-stone-700 outline-none focus:border-amber-400 dark:border-amber-900/50 dark:bg-stone-900 dark:text-stone-200"
        />
        <button
          type="submit"
          disabled={!newTitle.trim() || submitting}
          aria-label="הוספה לרשימה"
          className="flex shrink-0 items-center gap-1 rounded-xl bg-amber-500 px-4 py-3 text-sm font-medium text-white transition-colors hover:bg-amber-600 disabled:opacity-50"
        >
          <Plus className="h-5 w-5" />
        </button>
      </form>

      {pending.length > 0 && (
        <div className="flex justify-end">
          <ShareMenu text={shareText} label="שיתוף הרשימה" />
        </div>
      )}

      {loading && activeItems.length === 0 ? (
        <SkeletonList count={3} />
      ) : activeItems.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-amber-200 p-8 text-center text-sm text-stone-500 dark:border-amber-900/40 dark:text-stone-400">
          הרשימה ריקה. הוסיפו פריטים כאן או עברו ל&quot;הכנת רשימה&quot; כדי לבחור מהארסנל.
        </div>
      ) : (
        <>
          {grouped.map(({ category, items: categoryItems }) => (
            <div key={category} className="flex flex-col gap-2">
              <h3 className="text-sm font-bold text-stone-700 dark:text-stone-200">{category}</h3>
              <ul className="flex flex-col gap-2">
                {categoryItems.map((item) => (
                  <li
                    key={item.id}
                    className="flex items-center gap-3 rounded-2xl border border-amber-100 bg-white p-4 shadow-sm dark:border-amber-950/30 dark:bg-stone-900"
                  >
                    <button
                      type="button"
                      onClick={() => toggleCompleted(item)}
                      className="flex min-w-0 flex-1 items-center gap-3 text-right transition-colors hover:text-amber-600 dark:hover:text-amber-400"
                    >
                      <span className="h-8 w-8 shrink-0 rounded-full border-2 border-stone-300 dark:border-stone-600" />
                      <span className="flex-1 text-base font-medium text-stone-800 dark:text-stone-100">
                        {item.title}
                      </span>
                    </button>
                    <div className="flex shrink-0 items-center gap-1.5">
                      <button
                        type="button"
                        onClick={() => changeQty(item, -1)}
                        aria-label="הפחתת כמות"
                        className="flex h-7 w-7 items-center justify-center rounded-full bg-amber-50 text-amber-700 transition-colors hover:bg-amber-100 dark:bg-stone-800 dark:text-amber-400 dark:hover:bg-stone-700"
                      >
                        <Minus className="h-3.5 w-3.5" />
                      </button>
                      <span className="w-5 text-center text-sm font-semibold tabular-nums text-stone-700 dark:text-stone-200">
                        {item.qty}
                      </span>
                      <button
                        type="button"
                        onClick={() => changeQty(item, 1)}
                        aria-label="הוספת כמות"
                        className="flex h-7 w-7 items-center justify-center rounded-full bg-amber-50 text-amber-700 transition-colors hover:bg-amber-100 dark:bg-stone-800 dark:text-amber-400 dark:hover:bg-stone-700"
                      >
                        <Plus className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  </li>
                ))}
              </ul>
            </div>
          ))}

          {completed.length > 0 && (
            <div className="flex flex-col gap-2">
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-bold text-stone-400 dark:text-stone-500">בעגלה / נקנה</h3>
                <button
                  type="button"
                  onClick={clearCompleted}
                  className="text-xs font-medium text-amber-600 hover:underline dark:text-amber-400"
                >
                  נקה פריטים שנקנו
                </button>
              </div>
              <ul className="flex flex-col gap-2">
                {completed.map((item) => (
                  <li
                    key={item.id}
                    className="flex items-center gap-3 rounded-2xl border border-emerald-100 bg-emerald-50/50 p-4 dark:border-emerald-950/30 dark:bg-emerald-950/10"
                  >
                    <button
                      type="button"
                      onClick={() => toggleCompleted(item)}
                      aria-label="בטל סימון"
                      className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-emerald-500 text-white"
                    >
                      <Check className="h-5 w-5" />
                    </button>
                    <span className="flex-1 text-base text-stone-400 line-through dark:text-stone-500">
                      {item.title}
                      {item.qty > 1 && <span className="mr-1.5 text-xs">×{item.qty}</span>}
                    </span>
                    <button
                      type="button"
                      onClick={() => remove(item.id)}
                      aria-label="מחיקה"
                      className="shrink-0 rounded-full p-1.5 text-stone-400 hover:bg-red-50 hover:text-red-500 dark:hover:bg-red-950/30"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </>
      )}
    </div>
  );
}

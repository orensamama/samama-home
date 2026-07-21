"use client";

import { useState, type FormEvent } from "react";
import { Check, Plus, Trash2 } from "lucide-react";
import { useSupabaseTable } from "@/lib/useSupabaseTable";
import { supabase } from "@/lib/supabaseClient";
import { groupByCategory, type ShoppingItem } from "@/lib/shoppingData";

export default function LiveShoppingList() {
  const { rows: items, refetch } = useSupabaseTable<ShoppingItem>("shopping", "*", {
    column: "created_at",
    ascending: true,
  });
  const [newTitle, setNewTitle] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const activeItems = items.filter((item) => item.in_cart);
  const pending = activeItems.filter((item) => !item.completed);
  const completed = activeItems.filter((item) => item.completed);
  const grouped = groupByCategory(pending);

  async function toggleCompleted(item: ShoppingItem) {
    await supabase.from("shopping").update({ completed: !item.completed }).eq("id", item.id);
    refetch();
  }

  async function handleAdd(event: FormEvent) {
    event.preventDefault();
    const trimmed = newTitle.trim();
    if (!trimmed || submitting) return;
    setSubmitting(true);
    const { error } = await supabase.from("shopping").insert({ title: trimmed, added_by: "Shared" });
    if (!error) {
      setNewTitle("");
      await refetch();
    }
    setSubmitting(false);
  }

  async function remove(id: string) {
    await supabase.from("shopping").delete().eq("id", id);
    refetch();
  }

  async function clearCompleted() {
    const ids = completed.map((item) => item.id);
    if (ids.length === 0) return;
    await supabase.from("shopping").update({ in_cart: false }).in("id", ids);
    refetch();
  }

  return (
    <div className="flex flex-col gap-4">
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

      {activeItems.length === 0 ? (
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
                  <li key={item.id}>
                    <button
                      type="button"
                      onClick={() => toggleCompleted(item)}
                      className="flex w-full items-center gap-3 rounded-2xl border border-amber-100 bg-white p-4 text-right shadow-sm transition-colors hover:bg-amber-50 dark:border-amber-950/30 dark:bg-stone-900 dark:hover:bg-stone-800"
                    >
                      <span className="h-8 w-8 shrink-0 rounded-full border-2 border-stone-300 dark:border-stone-600" />
                      <span className="flex-1 text-base font-medium text-stone-800 dark:text-stone-100">
                        {item.title}
                      </span>
                    </button>
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

"use client";

import { useState, type FormEvent } from "react";
import { Check, Plus, Trash2 } from "lucide-react";
import PageHeader from "@/components/PageHeader";
import { useSupabaseTable } from "@/lib/useSupabaseTable";
import { supabase } from "@/lib/supabaseClient";
import type { ShoppingItem, TaskItem } from "@/lib/familyData";

type ChecklistItem = TaskItem | ShoppingItem;

export default function ChecklistPage({
  table,
  title,
  subtitle,
  placeholder,
  emptyText,
}: {
  table: "tasks" | "shopping";
  title: string;
  subtitle: string;
  placeholder: string;
  emptyText: string;
}) {
  const { rows: items, refetch } = useSupabaseTable<ChecklistItem>(table, "*", {
    column: "created_at",
    ascending: true,
  });
  const [newTitle, setNewTitle] = useState("");
  const [submitting, setSubmitting] = useState(false);

  async function handleAdd(event: FormEvent) {
    event.preventDefault();
    const trimmed = newTitle.trim();
    if (!trimmed || submitting) return;
    setSubmitting(true);
    const { error } = await supabase.from(table).insert({ title: trimmed });
    if (!error) {
      setNewTitle("");
      await refetch();
    }
    setSubmitting(false);
  }

  async function toggleDone(item: ChecklistItem) {
    await supabase.from(table).update({ done: !item.done }).eq("id", item.id);
    refetch();
  }

  async function remove(id: string) {
    await supabase.from(table).delete().eq("id", id);
    refetch();
  }

  return (
    <div className="flex min-h-full flex-col">
      <PageHeader title={title} subtitle={subtitle} />

      <div className="flex flex-col gap-3 p-4">
        <form onSubmit={handleAdd} className="flex gap-2">
          <input
            type="text"
            value={newTitle}
            onChange={(event) => setNewTitle(event.target.value)}
            placeholder={placeholder}
            className="flex-1 rounded-xl border border-amber-200 bg-white px-3 py-2 text-sm text-stone-700 outline-none focus:border-amber-400 dark:border-amber-900/50 dark:bg-stone-900 dark:text-stone-200"
          />
          <button
            type="submit"
            disabled={!newTitle.trim() || submitting}
            className="flex shrink-0 items-center gap-1 rounded-xl bg-amber-500 px-3 py-2 text-sm font-medium text-white transition-colors hover:bg-amber-600 disabled:opacity-50"
          >
            <Plus className="h-4 w-4" />
            הוספה
          </button>
        </form>

        {items.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-amber-200 p-8 text-center text-sm text-stone-500 dark:border-amber-900/40 dark:text-stone-400">
            {emptyText}
          </div>
        ) : (
          <ul className="flex flex-col gap-2">
            {items.map((item) => (
              <li
                key={item.id}
                className="flex items-center gap-3 rounded-2xl border border-amber-100 bg-white p-3 shadow-sm dark:border-amber-950/30 dark:bg-stone-900"
              >
                <button
                  type="button"
                  onClick={() => toggleDone(item)}
                  aria-label={item.done ? "סמן כלא בוצע" : "סמן כבוצע"}
                  className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full border-2 transition-colors ${
                    item.done
                      ? "border-amber-500 bg-amber-500 text-white"
                      : "border-stone-300 dark:border-stone-600"
                  }`}
                >
                  {item.done && <Check className="h-3.5 w-3.5" />}
                </button>
                <span
                  className={`flex-1 text-sm ${
                    item.done
                      ? "text-stone-400 line-through dark:text-stone-500"
                      : "text-stone-800 dark:text-stone-100"
                  }`}
                >
                  {item.title}
                </span>
                <button
                  type="button"
                  onClick={() => remove(item.id)}
                  aria-label="מחיקה"
                  className="shrink-0 rounded-full p-1.5 text-stone-400 transition-colors hover:bg-red-50 hover:text-red-500 dark:hover:bg-red-950/30"
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

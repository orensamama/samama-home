"use client";

import { useState, type FormEvent } from "react";
import { CalendarDays, Plus, Trash2 } from "lucide-react";
import PageHeader from "@/components/PageHeader";
import { useSupabaseTable } from "@/lib/useSupabaseTable";
import { supabase } from "@/lib/supabaseClient";
import { formatDate, type FamilyEvent } from "@/lib/familyData";

export default function EventsPage() {
  const { rows: events, refetch } = useSupabaseTable<FamilyEvent>(
    "events",
    "id, title, date:event_date",
    { column: "event_date", ascending: true }
  );
  const [title, setTitle] = useState("");
  const [date, setDate] = useState("");
  const [submitting, setSubmitting] = useState(false);

  async function handleAdd(event: FormEvent) {
    event.preventDefault();
    const trimmedTitle = title.trim();
    if (!trimmedTitle || !date || submitting) return;
    setSubmitting(true);
    const { error } = await supabase
      .from("events")
      .insert({ title: trimmedTitle, event_date: date });
    if (!error) {
      setTitle("");
      setDate("");
      await refetch();
    }
    setSubmitting(false);
  }

  async function remove(id: string) {
    await supabase.from("events").delete().eq("id", id);
    refetch();
  }

  return (
    <div className="flex min-h-full flex-col">
      <PageHeader title="תאריכים ואירועים" subtitle="האירועים הקרובים של המשפחה" />

      <div className="flex flex-col gap-3 p-4">
        <form
          onSubmit={handleAdd}
          className="flex flex-col gap-2 rounded-2xl border border-amber-100 bg-white p-3 shadow-sm dark:border-amber-950/30 dark:bg-stone-900"
        >
          <input
            type="text"
            value={title}
            onChange={(event) => setTitle(event.target.value)}
            placeholder="שם האירוע..."
            className="rounded-xl border border-amber-200 bg-white px-3 py-2 text-sm text-stone-700 outline-none focus:border-amber-400 dark:border-amber-900/50 dark:bg-stone-950 dark:text-stone-200"
          />
          <div className="flex gap-2">
            <input
              type="date"
              value={date}
              onChange={(event) => setDate(event.target.value)}
              className="flex-1 rounded-xl border border-amber-200 bg-white px-3 py-2 text-sm text-stone-700 outline-none focus:border-amber-400 dark:border-amber-900/50 dark:bg-stone-950 dark:text-stone-200"
            />
            <button
              type="submit"
              disabled={!title.trim() || !date || submitting}
              className="flex shrink-0 items-center gap-1 rounded-xl bg-amber-500 px-3 py-2 text-sm font-medium text-white transition-colors hover:bg-amber-600 disabled:opacity-50"
            >
              <Plus className="h-4 w-4" />
              הוספה
            </button>
          </div>
        </form>

        {events.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-amber-200 p-8 text-center text-sm text-stone-500 dark:border-amber-900/40 dark:text-stone-400">
            אין עדיין אירועים. הוסיפו את האירוע הראשון!
          </div>
        ) : (
          <ul className="flex flex-col gap-2">
            {events.map((event) => (
              <li
                key={event.id}
                className="flex items-center gap-3 rounded-2xl border border-amber-100 bg-white p-3 shadow-sm dark:border-amber-950/30 dark:bg-stone-900"
              >
                <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-amber-100 text-amber-600 dark:bg-amber-950/50 dark:text-amber-400">
                  <CalendarDays className="h-5 w-5" />
                </span>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium text-stone-800 dark:text-stone-100">
                    {event.title}
                  </p>
                  <p className="text-xs text-stone-500 dark:text-stone-400">
                    {formatDate(event.date)}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => remove(event.id)}
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

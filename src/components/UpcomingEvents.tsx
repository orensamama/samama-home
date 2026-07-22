"use client";

import { useState } from "react";
import Link from "next/link";
import { CalendarDays, Pencil } from "lucide-react";
import { useSupabaseTable } from "@/lib/useSupabaseTable";
import { supabase } from "@/lib/supabaseClient";
import { friendlyErrorMessage, logSupabaseError } from "@/lib/supabaseErrors";
import { formatDate, formatTime, type FamilyEvent } from "@/lib/familyData";
import EventFormModal, { type EventFormValues } from "@/components/EventFormModal";

export default function UpcomingEvents() {
  const { rows: events, refetch } = useSupabaseTable<FamilyEvent>(
    "events",
    "id, title, date:event_date, time, location, notes, image_url",
    { column: "event_date", ascending: true }
  );
  const [editingEvent, setEditingEvent] = useState<FamilyEvent | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const upcoming = events.slice(0, 3);

  async function handleFormSubmit(values: EventFormValues) {
    if (!editingEvent) return;
    setFormError(null);
    const { error } = await supabase
      .from("events")
      .update({
        title: values.title.trim(),
        event_date: values.date,
        time: values.time || null,
        location: values.location.trim() || null,
        notes: values.notes.trim() || null,
        image_url: values.image_url || null,
      })
      .eq("id", editingEvent.id);

    if (error) {
      logSupabaseError("עדכון אירוע", error);
      setFormError(friendlyErrorMessage(error));
      return;
    }

    await refetch();
    setEditingEvent(null);
  }

  return (
    <section className="flex flex-col gap-3">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-bold text-stone-800 dark:text-stone-100">
          תאריכים ואירועים קרובים
        </h2>
        <Link
          href="/events"
          className="text-xs font-medium text-amber-600 hover:underline dark:text-amber-400"
        >
          לכל האירועים
        </Link>
      </div>

      {upcoming.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-amber-200 p-6 text-center text-sm text-stone-500 dark:border-amber-900/40 dark:text-stone-400">
          אין אירועים קרובים כרגע.
        </div>
      ) : (
        <ul className="flex flex-col gap-2">
          {upcoming.map((event) => (
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
                  {event.time && ` • ${formatTime(event.time)}`}
                </p>
              </div>
              <button
                type="button"
                onClick={() => {
                  setEditingEvent(event);
                  setFormError(null);
                }}
                aria-label="עריכת אירוע"
                className="shrink-0 rounded-full p-1.5 text-stone-400 transition-colors hover:bg-amber-100 hover:text-amber-600 dark:hover:bg-amber-950/40 dark:hover:text-amber-400"
              >
                <Pencil className="h-4 w-4" />
              </button>
            </li>
          ))}
        </ul>
      )}

      {editingEvent && (
        <EventFormModal
          editingEvent={editingEvent}
          error={formError}
          onDismissError={() => setFormError(null)}
          onClose={() => {
            setEditingEvent(null);
            setFormError(null);
          }}
          onSubmit={handleFormSubmit}
        />
      )}
    </section>
  );
}

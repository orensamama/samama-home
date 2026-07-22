"use client";

import { useState } from "react";
import { Calendar, CalendarDays, Check, Copy, MapPin, Pencil, Plus, Trash2 } from "lucide-react";
import PageHeader from "@/components/PageHeader";
import ErrorBanner from "@/components/ErrorBanner";
import WeeklyCalendar from "@/components/WeeklyCalendar";
import MonthlyCalendar from "@/components/MonthlyCalendar";
import EventFormModal, { type EventFormValues } from "@/components/EventFormModal";
import { useSupabaseTable } from "@/lib/useSupabaseTable";
import { supabase } from "@/lib/supabaseClient";
import { friendlyErrorMessage, logSupabaseError } from "@/lib/supabaseErrors";
import { buildGoogleCalendarUrl, formatDate, formatTime, type FamilyEvent } from "@/lib/familyData";

type View = "list" | "week" | "month";

export default function EventsPage() {
  const { rows: events, refetch } = useSupabaseTable<FamilyEvent>(
    "events",
    "id, title, date:event_date, time, location, notes, image_url",
    { column: "event_date", ascending: true }
  );
  const [view, setView] = useState<View>("list");
  const [showForm, setShowForm] = useState(false);
  const [editingEvent, setEditingEvent] = useState<FamilyEvent | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [pageError, setPageError] = useState<string | null>(null);
  const [icalUrl] = useState(() =>
    typeof window === "undefined" ? "" : `${window.location.origin}/api/calendar/ical`
  );
  const [copied, setCopied] = useState(false);

  async function handleFormSubmit(values: EventFormValues) {
    setFormError(null);
    const payload = {
      title: values.title.trim(),
      event_date: values.date,
      time: values.time || null,
      location: values.location.trim() || null,
      notes: values.notes.trim() || null,
      image_url: values.image_url || null,
    };

    const { error } = editingEvent
      ? await supabase.from("events").update(payload).eq("id", editingEvent.id)
      : await supabase.from("events").insert(payload);

    if (error) {
      logSupabaseError("שמירת אירוע", error);
      setFormError(friendlyErrorMessage(error));
      return;
    }

    await refetch();
    setShowForm(false);
    setEditingEvent(null);
  }

  async function remove(id: string) {
    setPageError(null);
    const { error: err } = await supabase.from("events").delete().eq("id", id);
    if (err) {
      logSupabaseError("מחיקת אירוע", err);
      setPageError(friendlyErrorMessage(err));
      return;
    }
    refetch();
  }

  async function copyIcalUrl() {
    try {
      await navigator.clipboard.writeText(icalUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Clipboard API unavailable -- the URL is still visible to copy manually.
    }
  }

  return (
    <div className="flex min-h-full flex-col">
      <PageHeader title="תאריכים ואירועים" subtitle="האירועים הקרובים של המשפחה" />

      <div className="flex flex-col gap-4 p-4">
        <div className="grid grid-cols-3 gap-1.5 rounded-2xl bg-amber-50 p-1 dark:bg-stone-900">
          <button
            type="button"
            onClick={() => setView("list")}
            className={`rounded-xl px-2 py-2 text-xs font-medium transition-colors sm:text-sm ${
              view === "list"
                ? "bg-white text-amber-700 shadow-sm dark:bg-stone-800 dark:text-amber-400"
                : "text-stone-500 dark:text-stone-400"
            }`}
          >
            רשימה
          </button>
          <button
            type="button"
            onClick={() => setView("week")}
            className={`rounded-xl px-2 py-2 text-xs font-medium transition-colors sm:text-sm ${
              view === "week"
                ? "bg-white text-amber-700 shadow-sm dark:bg-stone-800 dark:text-amber-400"
                : "text-stone-500 dark:text-stone-400"
            }`}
          >
            לוח שבועי
          </button>
          <button
            type="button"
            onClick={() => setView("month")}
            className={`rounded-xl px-2 py-2 text-xs font-medium transition-colors sm:text-sm ${
              view === "month"
                ? "bg-white text-amber-700 shadow-sm dark:bg-stone-800 dark:text-amber-400"
                : "text-stone-500 dark:text-stone-400"
            }`}
          >
            לוח חודשי
          </button>
        </div>

        {pageError && <ErrorBanner message={pageError} onDismiss={() => setPageError(null)} />}

        <div className="rounded-2xl border border-amber-100 bg-white p-3 shadow-sm dark:border-amber-950/30 dark:bg-stone-900">
          <p className="mb-2 flex items-center gap-1.5 text-sm font-semibold text-stone-700 dark:text-stone-200">
            📅 סנכרן ל-Google Calendar
          </p>
          <p className="mb-2 text-xs text-stone-500 dark:text-stone-400">
            העתיקו את הקישור, ואז ב-Google Calendar: הגדרות ← הוספת יומן ← מכתובת URL ← הדביקו.
          </p>
          <div className="flex gap-2">
            <input
              type="text"
              readOnly
              value={icalUrl}
              className="min-w-0 flex-1 truncate rounded-lg border border-stone-200 bg-stone-50 px-2 py-1.5 text-xs text-stone-500 dark:border-stone-700 dark:bg-stone-950 dark:text-stone-400"
            />
            <button
              type="button"
              onClick={copyIcalUrl}
              disabled={!icalUrl}
              className="flex shrink-0 items-center gap-1 rounded-lg bg-amber-500 px-3 py-1.5 text-xs font-medium text-white transition-colors hover:bg-amber-600 disabled:opacity-50"
            >
              {copied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
              {copied ? "הועתק!" : "העתקה"}
            </button>
          </div>
        </div>

        {view === "week" ? (
          <WeeklyCalendar events={events} />
        ) : view === "month" ? (
          <MonthlyCalendar events={events} />
        ) : (
          <>
            <button
              type="button"
              onClick={() => {
                setEditingEvent(null);
                setFormError(null);
                setShowForm(true);
              }}
              className="flex items-center justify-center gap-1 rounded-xl bg-amber-500 px-3 py-2 text-sm font-medium text-white transition-colors hover:bg-amber-600"
            >
              <Plus className="h-4 w-4" />
              הוספת אירוע
            </button>

            {events.length === 0 ? (
              <div className="rounded-2xl border border-dashed border-amber-200 p-8 text-center text-sm text-stone-500 dark:border-amber-900/40 dark:text-stone-400">
                אין עדיין אירועים. הוסיפו את האירוע הראשון!
              </div>
            ) : (
              <ul className="flex flex-col gap-2">
                {events.map((event) => (
                  <li
                    key={event.id}
                    className="flex items-start gap-3 rounded-2xl border border-amber-100 bg-white p-3 shadow-sm dark:border-amber-950/30 dark:bg-stone-900"
                  >
                    {event.image_url ? (
                      // eslint-disable-next-line @next/next/no-img-element -- user-uploaded, arbitrary Supabase storage URL
                      <img
                        src={event.image_url}
                        alt=""
                        className="h-11 w-11 shrink-0 rounded-full border border-amber-100 object-cover dark:border-amber-950/30"
                      />
                    ) : (
                      <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-amber-100 text-amber-600 dark:bg-amber-950/50 dark:text-amber-400">
                        <CalendarDays className="h-5 w-5" />
                      </span>
                    )}
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium text-stone-800 dark:text-stone-100">
                        {event.title}
                      </p>
                      <p className="text-xs text-stone-500 dark:text-stone-400">
                        {formatDate(event.date)}
                        {event.time && ` • ${formatTime(event.time)}`}
                      </p>
                      {event.location && (
                        <p className="mt-1 flex items-center gap-1 text-xs text-stone-500 dark:text-stone-400">
                          <MapPin className="h-3 w-3 shrink-0" />
                          <span className="truncate">{event.location}</span>
                        </p>
                      )}
                      {event.notes && (
                        <p className="mt-1 whitespace-pre-wrap text-xs text-stone-500 dark:text-stone-400">
                          {event.notes}
                        </p>
                      )}
                      <a
                        href={buildGoogleCalendarUrl(event)}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="mt-1.5 inline-flex items-center gap-1 text-xs font-medium text-amber-600 hover:underline dark:text-amber-400"
                      >
                        <Calendar className="h-3 w-3" />
                        הוסף ליומן
                      </a>
                    </div>
                    <div className="flex shrink-0 flex-col gap-1">
                      <button
                        type="button"
                        onClick={() => {
                          setEditingEvent(event);
                          setFormError(null);
                          setShowForm(true);
                        }}
                        aria-label="עריכת אירוע"
                        className="rounded-full p-1.5 text-stone-400 transition-colors hover:bg-amber-100 hover:text-amber-600 dark:hover:bg-amber-950/40 dark:hover:text-amber-400"
                      >
                        <Pencil className="h-4 w-4" />
                      </button>
                      <button
                        type="button"
                        onClick={() => remove(event.id)}
                        aria-label="מחיקה"
                        className="rounded-full p-1.5 text-stone-400 transition-colors hover:bg-red-50 hover:text-red-500 dark:hover:bg-red-950/30"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </>
        )}
      </div>

      {showForm && (
        <EventFormModal
          editingEvent={editingEvent}
          error={formError}
          onDismissError={() => setFormError(null)}
          onClose={() => {
            setShowForm(false);
            setEditingEvent(null);
            setFormError(null);
          }}
          onSubmit={handleFormSubmit}
        />
      )}
    </div>
  );
}

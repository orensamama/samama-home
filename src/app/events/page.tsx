"use client";

import { useState, type ChangeEvent, type FormEvent } from "react";
import { CalendarDays, ImagePlus, MapPin, Plus, Trash2, X } from "lucide-react";
import PageHeader from "@/components/PageHeader";
import ErrorBanner from "@/components/ErrorBanner";
import WeeklyCalendar from "@/components/WeeklyCalendar";
import { useSupabaseTable } from "@/lib/useSupabaseTable";
import { supabase } from "@/lib/supabaseClient";
import { friendlyErrorMessage, logSupabaseError } from "@/lib/supabaseErrors";
import { formatDate, type FamilyEvent } from "@/lib/familyData";

const MAX_IMAGE_BYTES = 5 * 1024 * 1024;

type View = "list" | "calendar";

export default function EventsPage() {
  const { rows: events, refetch } = useSupabaseTable<FamilyEvent>(
    "events",
    "id, title, date:event_date, location, notes, image_url",
    { column: "event_date", ascending: true }
  );
  const [view, setView] = useState<View>("list");
  const [title, setTitle] = useState("");
  const [date, setDate] = useState("");
  const [location, setLocation] = useState("");
  const [notes, setNotes] = useState("");
  const [imageUrl, setImageUrl] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [uploadError, setUploadError] = useState<string | null>(null);

  async function handleFileChange(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    if (file.size > MAX_IMAGE_BYTES) {
      setUploadError("התמונה גדולה מדי (מקסימום 5MB)");
      return;
    }
    setUploading(true);
    setUploadError(null);
    const path = `${crypto.randomUUID()}-${file.name}`;
    const { error: err } = await supabase.storage.from("event-images").upload(path, file);
    if (err) {
      console.error("[Supabase] העלאת תמונה לאירוע:", err.message, err);
      setUploadError("העלאת התמונה נכשלה. ודאו שמיגרציית 0006 הורצה בסופאבייס.");
      setUploading(false);
      return;
    }
    const { data } = supabase.storage.from("event-images").getPublicUrl(path);
    setImageUrl(data.publicUrl);
    setUploading(false);
  }

  async function handleAdd(event: FormEvent) {
    event.preventDefault();
    const trimmedTitle = title.trim();
    if (!trimmedTitle || !date || submitting) return;
    setSubmitting(true);
    setError(null);
    const { error: err } = await supabase.from("events").insert({
      title: trimmedTitle,
      event_date: date,
      location: location.trim() || null,
      notes: notes.trim() || null,
      image_url: imageUrl || null,
    });
    if (err) {
      logSupabaseError("הוספת אירוע", err);
      setError(friendlyErrorMessage(err));
      setSubmitting(false);
      return;
    }
    setTitle("");
    setDate("");
    setLocation("");
    setNotes("");
    setImageUrl("");
    await refetch();
    setSubmitting(false);
  }

  async function remove(id: string) {
    setError(null);
    const { error: err } = await supabase.from("events").delete().eq("id", id);
    if (err) {
      logSupabaseError("מחיקת אירוע", err);
      setError(friendlyErrorMessage(err));
      return;
    }
    refetch();
  }

  return (
    <div className="flex min-h-full flex-col">
      <PageHeader title="תאריכים ואירועים" subtitle="האירועים הקרובים של המשפחה" />

      <div className="flex flex-col gap-4 p-4">
        <div className="grid grid-cols-2 gap-1.5 rounded-2xl bg-amber-50 p-1 dark:bg-stone-900">
          <button
            type="button"
            onClick={() => setView("list")}
            className={`rounded-xl px-2 py-2 text-sm font-medium transition-colors ${
              view === "list"
                ? "bg-white text-amber-700 shadow-sm dark:bg-stone-800 dark:text-amber-400"
                : "text-stone-500 dark:text-stone-400"
            }`}
          >
            רשימה
          </button>
          <button
            type="button"
            onClick={() => setView("calendar")}
            className={`rounded-xl px-2 py-2 text-sm font-medium transition-colors ${
              view === "calendar"
                ? "bg-white text-amber-700 shadow-sm dark:bg-stone-800 dark:text-amber-400"
                : "text-stone-500 dark:text-stone-400"
            }`}
          >
            לוח שבועי
          </button>
        </div>

        {error && <ErrorBanner message={error} onDismiss={() => setError(null)} />}

        {view === "calendar" ? (
          <WeeklyCalendar events={events} />
        ) : (
          <>
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
              <div className="flex flex-col gap-2 sm:flex-row">
                <input
                  type="date"
                  value={date}
                  onChange={(event) => setDate(event.target.value)}
                  className="flex-1 rounded-xl border border-amber-200 bg-white px-3 py-2 text-sm text-stone-700 outline-none focus:border-amber-400 dark:border-amber-900/50 dark:bg-stone-950 dark:text-stone-200"
                />
                <input
                  type="text"
                  value={location}
                  onChange={(event) => setLocation(event.target.value)}
                  placeholder="מיקום (לא חובה)"
                  className="flex-1 rounded-xl border border-amber-200 bg-white px-3 py-2 text-sm text-stone-700 outline-none focus:border-amber-400 dark:border-amber-900/50 dark:bg-stone-950 dark:text-stone-200"
                />
              </div>
              <textarea
                value={notes}
                onChange={(event) => setNotes(event.target.value)}
                rows={2}
                placeholder="הערות / פרטים נוספים (לא חובה)"
                className="resize-none rounded-xl border border-amber-200 bg-white px-3 py-2 text-sm text-stone-700 outline-none focus:border-amber-400 dark:border-amber-900/50 dark:bg-stone-950 dark:text-stone-200"
              />

              <div>
                {imageUrl ? (
                  <div className="relative w-fit">
                    {/* eslint-disable-next-line @next/next/no-img-element -- user-uploaded, arbitrary Supabase storage URL */}
                    <img
                      src={imageUrl}
                      alt=""
                      className="h-20 w-20 rounded-xl border border-amber-200 object-cover dark:border-amber-900/50"
                    />
                    <button
                      type="button"
                      onClick={() => setImageUrl("")}
                      aria-label="הסרת תמונה"
                      className="absolute -right-2 -top-2 rounded-full bg-stone-800 p-1 text-white shadow"
                    >
                      <X className="h-3 w-3" />
                    </button>
                  </div>
                ) : (
                  <label className="flex w-fit cursor-pointer items-center gap-2 rounded-xl border border-dashed border-amber-300 px-3 py-2 text-sm text-amber-700 transition-colors hover:bg-amber-50 dark:border-amber-800 dark:text-amber-400 dark:hover:bg-stone-800">
                    <ImagePlus className="h-4 w-4" />
                    {uploading ? "מעלה תמונה..." : "צירוף תמונה (לא חובה)"}
                    <input
                      type="file"
                      accept="image/*"
                      capture="environment"
                      className="hidden"
                      disabled={uploading}
                      onChange={handleFileChange}
                    />
                  </label>
                )}
                {uploadError && (
                  <p className="mt-1 text-xs text-rose-600 dark:text-rose-400">{uploadError}</p>
                )}
              </div>

              <button
                type="submit"
                disabled={!title.trim() || !date || submitting}
                className="flex items-center justify-center gap-1 rounded-xl bg-amber-500 px-3 py-2 text-sm font-medium text-white transition-colors hover:bg-amber-600 disabled:opacity-50"
              >
                <Plus className="h-4 w-4" />
                הוספה
              </button>
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
                      <p className="text-xs text-stone-500 dark:text-stone-400">{formatDate(event.date)}</p>
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
          </>
        )}
      </div>
    </div>
  );
}

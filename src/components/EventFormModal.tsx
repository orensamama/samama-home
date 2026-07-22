"use client";

import { useState, type ChangeEvent, type FormEvent } from "react";
import { ImagePlus, X } from "lucide-react";
import { supabase } from "@/lib/supabaseClient";
import type { FamilyEvent } from "@/lib/familyData";
import ErrorBanner from "@/components/ErrorBanner";

const MAX_IMAGE_BYTES = 5 * 1024 * 1024;

export type EventFormValues = {
  title: string;
  date: string;
  time: string;
  location: string;
  notes: string;
  image_url: string;
};

function toFormValues(event: FamilyEvent | null): EventFormValues {
  if (!event) {
    return { title: "", date: "", time: "", location: "", notes: "", image_url: "" };
  }
  return {
    title: event.title,
    date: event.date,
    time: event.time ? event.time.slice(0, 5) : "",
    location: event.location ?? "",
    notes: event.notes ?? "",
    image_url: event.image_url ?? "",
  };
}

export default function EventFormModal({
  editingEvent,
  error,
  onDismissError,
  onClose,
  onSubmit,
}: {
  editingEvent: FamilyEvent | null | undefined;
  error?: string | null;
  onDismissError: () => void;
  onClose: () => void;
  onSubmit: (values: EventFormValues) => Promise<void>;
}) {
  const [values, setValues] = useState<EventFormValues>(() => toFormValues(editingEvent ?? null));
  const [submitting, setSubmitting] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    if (!values.title.trim() || !values.date || submitting) return;
    setSubmitting(true);
    await onSubmit(values);
    setSubmitting(false);
  }

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
    setValues((v) => ({ ...v, image_url: data.publicUrl }));
    setUploading(false);
  }

  return (
    <div className="fixed inset-0 z-[60] flex items-end justify-center bg-black/40 sm:items-center">
      <div className="flex max-h-[85dvh] w-full flex-col overflow-hidden rounded-t-3xl bg-white shadow-lg sm:max-w-md sm:rounded-3xl dark:bg-stone-900">
        <div className="flex shrink-0 items-center justify-between border-b border-amber-100 p-4 dark:border-amber-950/30">
          <h2 className="text-lg font-bold text-stone-800 dark:text-stone-100">
            {editingEvent ? "עריכת אירוע" : "אירוע חדש"}
          </h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="סגירה"
            className="rounded-full p-1.5 text-stone-400 hover:bg-stone-100 dark:hover:bg-stone-800"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="flex min-h-0 flex-1 flex-col">
          <div className="flex flex-1 flex-col gap-3 overflow-y-auto p-4">
            {error && <ErrorBanner message={error} onDismiss={onDismissError} />}

            <div>
              <p className="mb-1.5 text-xs font-medium text-stone-500 dark:text-stone-400">שם האירוע</p>
              <input
                type="text"
                autoFocus
                value={values.title}
                onChange={(event) => setValues((v) => ({ ...v, title: event.target.value }))}
                placeholder="שם האירוע..."
                className="w-full rounded-xl border border-amber-200 bg-white px-3 py-2 text-sm text-stone-700 outline-none focus:border-amber-400 dark:border-amber-900/50 dark:bg-stone-950 dark:text-stone-200"
              />
            </div>

            <div className="flex flex-col gap-3 sm:flex-row sm:gap-2">
              <div className="flex-1">
                <p className="mb-1.5 text-xs font-medium text-stone-500 dark:text-stone-400">תאריך *</p>
                <input
                  type="date"
                  value={values.date}
                  onChange={(event) => setValues((v) => ({ ...v, date: event.target.value }))}
                  className="w-full rounded-xl border border-amber-200 bg-white px-3 py-2 text-sm text-stone-700 outline-none focus:border-amber-400 dark:border-amber-900/50 dark:bg-stone-950 dark:text-stone-200"
                />
              </div>
              <div className="flex-1">
                <p className="mb-1.5 text-xs font-medium text-stone-500 dark:text-stone-400">שעה (לא חובה)</p>
                <input
                  type="time"
                  value={values.time}
                  onChange={(event) => setValues((v) => ({ ...v, time: event.target.value }))}
                  className="w-full rounded-xl border border-amber-200 bg-white px-3 py-2 text-sm text-stone-700 outline-none focus:border-amber-400 dark:border-amber-900/50 dark:bg-stone-950 dark:text-stone-200"
                />
              </div>
            </div>

            <div>
              <p className="mb-1.5 text-xs font-medium text-stone-500 dark:text-stone-400">מיקום (לא חובה)</p>
              <input
                type="text"
                value={values.location}
                onChange={(event) => setValues((v) => ({ ...v, location: event.target.value }))}
                placeholder="מיקום..."
                className="w-full rounded-xl border border-amber-200 bg-white px-3 py-2 text-sm text-stone-700 outline-none focus:border-amber-400 dark:border-amber-900/50 dark:bg-stone-950 dark:text-stone-200"
              />
            </div>

            <div>
              <p className="mb-1.5 text-xs font-medium text-stone-500 dark:text-stone-400">
                הערות / פרטים נוספים (לא חובה)
              </p>
              <textarea
                value={values.notes}
                onChange={(event) => setValues((v) => ({ ...v, notes: event.target.value }))}
                rows={2}
                placeholder="הערות..."
                className="w-full resize-none rounded-xl border border-amber-200 bg-white px-3 py-2 text-sm text-stone-700 outline-none focus:border-amber-400 dark:border-amber-900/50 dark:bg-stone-950 dark:text-stone-200"
              />
            </div>

            <div>
              <p className="mb-1.5 text-xs font-medium text-stone-500 dark:text-stone-400">
                תמונה מצורפת (לא חובה)
              </p>
              {values.image_url ? (
                <div className="relative w-fit">
                  {/* eslint-disable-next-line @next/next/no-img-element -- user-uploaded, arbitrary Supabase storage URL */}
                  <img
                    src={values.image_url}
                    alt=""
                    className="h-24 w-24 rounded-xl border border-amber-200 object-cover dark:border-amber-900/50"
                  />
                  <button
                    type="button"
                    onClick={() => setValues((v) => ({ ...v, image_url: "" }))}
                    aria-label="הסרת תמונה"
                    className="absolute -right-2 -top-2 rounded-full bg-stone-800 p-1 text-white shadow"
                  >
                    <X className="h-3 w-3" />
                  </button>
                </div>
              ) : (
                <label className="flex w-fit cursor-pointer items-center gap-2 rounded-xl border border-dashed border-amber-300 px-3 py-2 text-sm text-amber-700 transition-colors hover:bg-amber-50 dark:border-amber-800 dark:text-amber-400 dark:hover:bg-stone-800">
                  <ImagePlus className="h-4 w-4" />
                  {uploading ? "מעלה תמונה..." : "צירוף תמונה"}
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
          </div>

          <div className="shrink-0 border-t border-amber-100 bg-white p-4 dark:border-amber-950/30 dark:bg-stone-900">
            <button
              type="submit"
              disabled={!values.title.trim() || !values.date || submitting}
              className="w-full rounded-xl bg-amber-500 px-4 py-3 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-amber-600 disabled:opacity-50"
            >
              {editingEvent ? "שמירת שינויים" : "הוספת אירוע"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

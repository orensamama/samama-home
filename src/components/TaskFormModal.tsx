"use client";

import { useState, type ChangeEvent, type FormEvent } from "react";
import { ImagePlus, X } from "lucide-react";
import {
  ASSIGNEE_OPTIONS,
  CATEGORY_SUGGESTIONS,
  URGENCY_LEVELS,
  type Assignee,
  type Task,
  type Urgency,
} from "@/lib/taskData";
import { supabase } from "@/lib/supabaseClient";
import ErrorBanner from "@/components/ErrorBanner";

const MAX_IMAGE_BYTES = 5 * 1024 * 1024;

export type TaskFormValues = {
  title: string;
  assignee: Assignee;
  due_date: string;
  urgency: Urgency;
  notes: string;
  category: string;
  image_url: string;
};

function toFormValues(task: Task | null, defaultAssignee: Assignee): TaskFormValues {
  if (!task) {
    return {
      title: "",
      assignee: defaultAssignee,
      due_date: "",
      urgency: "medium",
      notes: "",
      category: "",
      image_url: "",
    };
  }
  return {
    title: task.title,
    assignee: task.assignee === "Other" ? defaultAssignee : task.assignee,
    due_date: task.due_date ?? "",
    urgency: task.urgency,
    notes: task.notes ?? "",
    category: task.category ?? "",
    image_url: task.image_url ?? "",
  };
}

export default function TaskFormModal({
  editingTask,
  defaultAssignee,
  error,
  onDismissError,
  onClose,
  onSubmit,
}: {
  editingTask: Task | null | undefined;
  defaultAssignee: Assignee;
  error?: string | null;
  onDismissError: () => void;
  onClose: () => void;
  onSubmit: (values: TaskFormValues) => Promise<void>;
}) {
  const [values, setValues] = useState<TaskFormValues>(() => toFormValues(editingTask ?? null, defaultAssignee));
  const [submitting, setSubmitting] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    if (!values.title.trim() || submitting) return;
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
    const { error } = await supabase.storage.from("task-images").upload(path, file);
    if (error) {
      console.error("[Supabase] העלאת תמונה:", error.message, error);
      setUploadError("העלאת התמונה נכשלה. ודאו שמיגרציית 0005 הורצה בסופאבייס.");
      setUploading(false);
      return;
    }
    const { data } = supabase.storage.from("task-images").getPublicUrl(path);
    setValues((v) => ({ ...v, image_url: data.publicUrl }));
    setUploading(false);
  }

  return (
    <div className="fixed inset-0 z-[60] flex items-end justify-center bg-black/40 sm:items-center">
      <div className="flex max-h-[85dvh] w-full flex-col overflow-hidden rounded-t-3xl bg-white shadow-lg sm:max-w-md sm:rounded-3xl dark:bg-stone-900">
        <div className="flex shrink-0 items-center justify-between border-b border-amber-100 p-4 dark:border-amber-950/30">
          <h2 className="text-lg font-bold text-stone-800 dark:text-stone-100">
            {editingTask ? "עריכת משימה" : "משימה חדשה"}
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

            <input
              type="text"
              autoFocus
              value={values.title}
              onChange={(event) => setValues((v) => ({ ...v, title: event.target.value }))}
              placeholder="כותרת המשימה..."
              className="rounded-xl border border-amber-200 bg-white px-3 py-2 text-sm text-stone-700 outline-none focus:border-amber-400 dark:border-amber-900/50 dark:bg-stone-950 dark:text-stone-200"
            />

            <div>
              <p className="mb-1.5 text-xs font-medium text-stone-500 dark:text-stone-400">שיוך</p>
              <div className="grid grid-cols-3 gap-2">
                {ASSIGNEE_OPTIONS.map((option) => (
                  <button
                    key={option.value}
                    type="button"
                    onClick={() => setValues((v) => ({ ...v, assignee: option.value }))}
                    className={`rounded-xl border px-2 py-1.5 text-sm font-medium transition-colors ${
                      values.assignee === option.value
                        ? "border-amber-400 bg-amber-500 text-white"
                        : "border-stone-200 bg-white text-stone-600 dark:border-stone-700 dark:bg-stone-950 dark:text-stone-300"
                    }`}
                  >
                    {option.label}
                  </button>
                ))}
              </div>
            </div>

            <div className="flex flex-col gap-3 sm:flex-row sm:gap-2">
              <div className="flex-1">
                <p className="mb-1.5 text-xs font-medium text-stone-500 dark:text-stone-400">תאריך יעד</p>
                <input
                  type="date"
                  value={values.due_date}
                  onChange={(event) => setValues((v) => ({ ...v, due_date: event.target.value }))}
                  className="w-full rounded-xl border border-amber-200 bg-white px-3 py-2 text-sm text-stone-700 outline-none focus:border-amber-400 dark:border-amber-900/50 dark:bg-stone-950 dark:text-stone-200"
                />
              </div>
              <div className="flex-1">
                <p className="mb-1.5 text-xs font-medium text-stone-500 dark:text-stone-400">דחיפות</p>
                <select
                  value={values.urgency}
                  onChange={(event) =>
                    setValues((v) => ({ ...v, urgency: event.target.value as Urgency }))
                  }
                  className="w-full rounded-xl border border-amber-200 bg-white px-3 py-2 text-sm text-stone-700 outline-none focus:border-amber-400 dark:border-amber-900/50 dark:bg-stone-950 dark:text-stone-200"
                >
                  {(Object.keys(URGENCY_LEVELS) as Urgency[]).map((level) => (
                    <option key={level} value={level}>
                      {URGENCY_LEVELS[level].label}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div>
              <p className="mb-1.5 text-xs font-medium text-stone-500 dark:text-stone-400">קטגוריה</p>
              <input
                type="text"
                list="task-category-suggestions"
                value={values.category}
                onChange={(event) => setValues((v) => ({ ...v, category: event.target.value }))}
                placeholder="לדוגמה: בית, עבודה..."
                className="w-full rounded-xl border border-amber-200 bg-white px-3 py-2 text-sm text-stone-700 outline-none focus:border-amber-400 dark:border-amber-900/50 dark:bg-stone-950 dark:text-stone-200"
              />
              <datalist id="task-category-suggestions">
                {CATEGORY_SUGGESTIONS.map((suggestion) => (
                  <option key={suggestion} value={suggestion} />
                ))}
              </datalist>
            </div>

            <div>
              <p className="mb-1.5 text-xs font-medium text-stone-500 dark:text-stone-400">הערות</p>
              <textarea
                value={values.notes}
                onChange={(event) => setValues((v) => ({ ...v, notes: event.target.value }))}
                rows={3}
                placeholder="פרטים נוספים..."
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
              disabled={!values.title.trim() || submitting}
              className="w-full rounded-xl bg-amber-500 px-4 py-3 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-amber-600 disabled:opacity-50"
            >
              {editingTask ? "שמירת שינויים" : "הוספת משימה"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

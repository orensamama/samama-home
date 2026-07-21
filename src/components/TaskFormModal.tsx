"use client";

import { useState, type FormEvent } from "react";
import { X } from "lucide-react";
import {
  ASSIGNEE_OPTIONS,
  CATEGORY_SUGGESTIONS,
  URGENCY_LEVELS,
  type Assignee,
  type Task,
  type Urgency,
} from "@/lib/taskData";
import ErrorBanner from "@/components/ErrorBanner";

export type TaskFormValues = {
  title: string;
  assignee: Assignee;
  due_date: string;
  urgency: Urgency;
  notes: string;
  category: string;
};

function toFormValues(task: Task | null, defaultAssignee: Assignee): TaskFormValues {
  if (!task) {
    return { title: "", assignee: defaultAssignee, due_date: "", urgency: "medium", notes: "", category: "" };
  }
  return {
    title: task.title,
    assignee: task.assignee === "Other" ? defaultAssignee : task.assignee,
    due_date: task.due_date ?? "",
    urgency: task.urgency,
    notes: task.notes ?? "",
    category: task.category ?? "",
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

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    if (!values.title.trim() || submitting) return;
    setSubmitting(true);
    await onSubmit(values);
    setSubmitting(false);
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 sm:items-center">
      <div className="flex max-h-[85vh] w-full flex-col overflow-hidden rounded-t-3xl bg-white shadow-lg sm:max-w-md sm:rounded-3xl dark:bg-stone-900">
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
              <div className="flex gap-2">
                {ASSIGNEE_OPTIONS.map((option) => (
                  <button
                    key={option.value}
                    type="button"
                    onClick={() => setValues((v) => ({ ...v, assignee: option.value }))}
                    className={`flex-1 rounded-xl border px-2 py-1.5 text-sm font-medium transition-colors ${
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

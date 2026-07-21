"use client";

import { useState } from "react";
import { LayoutTemplate, X } from "lucide-react";
import type { PostgrestError } from "@supabase/supabase-js";
import type { Task } from "@/lib/taskData";
import ErrorBanner from "@/components/ErrorBanner";

export type TemplateGroup = {
  name: string;
  tasks: Task[];
};

export default function TemplatePicker({
  templateGroups,
  targetLabel,
  onClose,
  onLoad,
}: {
  templateGroups: TemplateGroup[];
  targetLabel: string;
  onClose: () => void;
  onLoad: (group: TemplateGroup) => Promise<PostgrestError | null>;
}) {
  const [loadingName, setLoadingName] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function handleLoad(group: TemplateGroup) {
    setLoadingName(group.name);
    setError(null);
    const err = await onLoad(group);
    setLoadingName(null);
    if (err) {
      setError(err.message);
      return;
    }
    onClose();
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 sm:items-center">
      <div className="max-h-[90vh] w-full overflow-y-auto rounded-t-3xl bg-white p-4 shadow-lg sm:max-w-md sm:rounded-3xl dark:bg-stone-900">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-lg font-bold text-stone-800 dark:text-stone-100">טעינת תבנית</h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="סגירה"
            className="rounded-full p-1.5 text-stone-400 hover:bg-stone-100 dark:hover:bg-stone-800"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {error && (
          <div className="mb-3">
            <ErrorBanner message={error} onDismiss={() => setError(null)} />
          </div>
        )}

        <p className="mb-3 text-sm text-stone-500 dark:text-stone-400">
          המשימות יתווספו אל: <span className="font-medium text-amber-600 dark:text-amber-400">{targetLabel}</span>
        </p>

        {templateGroups.length === 0 ? (
          <p className="rounded-2xl border border-dashed border-amber-200 p-6 text-center text-sm text-stone-500 dark:border-amber-900/40 dark:text-stone-400">
            אין תבניות זמינות.
          </p>
        ) : (
          <div className="flex flex-col gap-2">
            {templateGroups.map((group) => (
              <button
                key={group.name}
                type="button"
                onClick={() => handleLoad(group)}
                disabled={loadingName !== null}
                className="flex items-center justify-between gap-3 rounded-2xl border border-amber-100 bg-white p-3 text-right shadow-sm transition-colors hover:bg-amber-50 disabled:opacity-50 dark:border-amber-950/30 dark:bg-stone-950 dark:hover:bg-stone-800"
              >
                <span className="flex items-center gap-2">
                  <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-amber-100 text-amber-600 dark:bg-amber-950/50 dark:text-amber-400">
                    <LayoutTemplate className="h-4.5 w-4.5" />
                  </span>
                  <span>
                    <span className="block text-sm font-medium text-stone-800 dark:text-stone-100">
                      {group.name}
                    </span>
                    <span className="block text-xs text-stone-500 dark:text-stone-400">
                      {group.tasks.length} משימות
                    </span>
                  </span>
                </span>
                {loadingName === group.name && (
                  <span className="text-xs text-stone-400">טוען…</span>
                )}
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

"use client";

import { AlertTriangle, X } from "lucide-react";

export default function ErrorBanner({
  message,
  onDismiss,
}: {
  message: string;
  onDismiss: () => void;
}) {
  return (
    <div className="flex items-start gap-2 rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700 dark:border-rose-900/50 dark:bg-rose-950/30 dark:text-rose-400">
      <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
      <span className="flex-1">{message}</span>
      <button
        type="button"
        onClick={onDismiss}
        aria-label="סגירה"
        className="shrink-0 rounded-full p-0.5 hover:bg-rose-100 dark:hover:bg-rose-900/40"
      >
        <X className="h-3.5 w-3.5" />
      </button>
    </div>
  );
}

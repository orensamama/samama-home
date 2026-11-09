"use client";

import { useEffect, useState } from "react";
import { Loader2, Pencil, Trash2 } from "lucide-react";

/**
 * The quick action bar at the end of a transaction row: edit (pencil) and delete (trash). Delete asks
 * once, right in the row ("מחק?"), and then removes the transaction without opening the edit screen.
 */
export default function TransactionActions({
  name,
  onEdit,
  onDelete,
}: {
  /** The transaction's name, for the buttons' accessible labels. */
  name: string;
  onEdit: () => void;
  onDelete: () => Promise<void> | void;
}) {
  const [armed, setArmed] = useState(false);
  const [deleting, setDeleting] = useState(false);

  useEffect(() => {
    if (!armed) return;
    const timeout = setTimeout(() => setArmed(false), 3500);
    return () => clearTimeout(timeout);
  }, [armed]);

  async function confirmDelete() {
    setDeleting(true);
    try {
      await onDelete();
    } finally {
      setDeleting(false);
      setArmed(false);
    }
  }

  return (
    <span className="flex shrink-0 items-center gap-0.5 pe-2">
      {armed ? (
        <>
          <button
            type="button"
            onClick={() => void confirmDelete()}
            disabled={deleting}
            aria-label={`אישור מחיקת ${name}`}
            className="flex items-center gap-1 rounded-lg bg-red-500 px-2 py-1 text-[11px] font-semibold text-white hover:bg-red-600 disabled:opacity-60"
          >
            {deleting && <Loader2 className="h-3 w-3 animate-spin" />}
            מחק?
          </button>
          <button
            type="button"
            onClick={() => setArmed(false)}
            disabled={deleting}
            className="rounded-lg px-1.5 py-1 text-[11px] font-medium text-stone-500 hover:bg-stone-100 dark:text-stone-400 dark:hover:bg-stone-800"
          >
            ביטול
          </button>
        </>
      ) : (
        <>
          <button
            type="button"
            onClick={onEdit}
            aria-label={`עריכת ${name}`}
            title="עריכה"
            className="rounded-full p-1.5 text-stone-400 transition-colors hover:bg-amber-100 hover:text-amber-600 dark:hover:bg-amber-950/40 dark:hover:text-amber-400"
          >
            <Pencil className="h-3.5 w-3.5" />
          </button>
          <button
            type="button"
            onClick={() => setArmed(true)}
            aria-label={`מחיקת ${name}`}
            title="מחיקה"
            className="rounded-full p-1.5 text-stone-400 transition-colors hover:bg-red-50 hover:text-red-500 dark:hover:bg-red-950/30"
          >
            <Trash2 className="h-3.5 w-3.5" />
          </button>
        </>
      )}
    </span>
  );
}

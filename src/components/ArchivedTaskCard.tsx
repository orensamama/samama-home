"use client";

import { RotateCcw, Trash2 } from "lucide-react";
import type { Task } from "@/lib/taskData";

export default function ArchivedTaskCard({
  task,
  onRestore,
  onDeleteForever,
}: {
  task: Task;
  onRestore: (task: Task) => void;
  onDeleteForever: (id: string) => void;
}) {
  return (
    <li className="flex items-center gap-3 rounded-2xl border border-stone-200 bg-stone-50 p-3 dark:border-stone-800 dark:bg-stone-900/60">
      {task.image_url && (
        // eslint-disable-next-line @next/next/no-img-element -- user-uploaded, arbitrary Supabase storage URL
        <img
          src={task.image_url}
          alt=""
          className="h-10 w-10 shrink-0 rounded-lg border border-stone-200 object-cover opacity-70 dark:border-stone-700"
        />
      )}
      <span className="flex-1 truncate text-sm text-stone-400 line-through dark:text-stone-500">
        {task.title}
      </span>
      <button
        type="button"
        onClick={() => onRestore(task)}
        aria-label="שחזור משימה"
        className="shrink-0 rounded-full p-1.5 text-stone-400 transition-colors hover:bg-amber-100 hover:text-amber-600 dark:hover:bg-amber-950/40 dark:hover:text-amber-400"
      >
        <RotateCcw className="h-4 w-4" />
      </button>
      <button
        type="button"
        onClick={() => onDeleteForever(task.id)}
        aria-label="מחיקה לצמיתות"
        className="shrink-0 rounded-full p-1.5 text-stone-400 transition-colors hover:bg-red-50 hover:text-red-500 dark:hover:bg-red-950/30"
      >
        <Trash2 className="h-4 w-4" />
      </button>
    </li>
  );
}

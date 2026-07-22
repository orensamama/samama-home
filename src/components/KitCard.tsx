"use client";

import { useEffect, useState } from "react";
import { ChevronDown } from "lucide-react";
import TaskCard from "@/components/TaskCard";
import type { Task } from "@/lib/taskData";

export default function KitCard({
  name,
  tasks,
  selectionMode,
  selectedIds,
  onToggleSelect,
  onCycleStatus,
  onToggleDone,
  onEdit,
  onArchiveItem,
  onClearCompleted,
  onDeleteKit,
}: {
  name: string;
  tasks: Task[];
  selectionMode: boolean;
  selectedIds: Set<string>;
  onToggleSelect: (id: string) => void;
  onCycleStatus: (task: Task) => void;
  onToggleDone: (task: Task) => void;
  onEdit: (task: Task) => void;
  onArchiveItem: (task: Task) => void;
  onClearCompleted: (kitTasks: Task[]) => void;
  onDeleteKit: (kitTasks: Task[]) => void;
}) {
  const [expanded, setExpanded] = useState(true);
  const [confirmingDelete, setConfirmingDelete] = useState(false);

  useEffect(() => {
    if (!confirmingDelete) return;
    const timeout = setTimeout(() => setConfirmingDelete(false), 3000);
    return () => clearTimeout(timeout);
  }, [confirmingDelete]);

  const doneCount = tasks.filter((task) => task.status === "done").length;
  const total = tasks.length;
  const percent = total === 0 ? 0 : Math.round((doneCount / total) * 100);

  return (
    <div className="rounded-2xl border border-amber-100 bg-white shadow-sm dark:border-amber-950/30 dark:bg-stone-900">
      <button
        type="button"
        onClick={() => setExpanded((value) => !value)}
        className="flex w-full items-center gap-2 p-3 text-right"
      >
        <div className="min-w-0 flex-1">
          <div className="flex items-center justify-between gap-2">
            <span className="truncate text-sm font-bold text-stone-800 dark:text-stone-100">{name}</span>
            <span className="shrink-0 text-xs text-stone-500 dark:text-stone-400">
              {doneCount}/{total}
            </span>
          </div>
          <div className="mt-1.5 h-1.5 w-full overflow-hidden rounded-full bg-stone-100 dark:bg-stone-800">
            <div
              className="h-full rounded-full bg-emerald-500 transition-all"
              style={{ width: `${percent}%` }}
            />
          </div>
        </div>
        <ChevronDown
          className={`h-4 w-4 shrink-0 text-stone-400 transition-transform ${expanded ? "rotate-180" : ""}`}
        />
      </button>

      {expanded && (
        <div className="flex flex-col gap-2 border-t border-amber-100 p-3 dark:border-amber-950/30">
          {!selectionMode && (
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => onClearCompleted(tasks)}
                disabled={doneCount === 0}
                className="flex-1 rounded-lg border border-stone-200 px-2 py-1.5 text-xs font-medium text-stone-500 transition-colors hover:bg-stone-50 disabled:opacity-40 dark:border-stone-700 dark:text-stone-400 dark:hover:bg-stone-800"
              >
                נקה משימות שבוצעו
              </button>
              {confirmingDelete ? (
                <button
                  type="button"
                  onClick={() => onDeleteKit(tasks)}
                  className="flex-1 rounded-lg bg-red-500 px-2 py-1.5 text-xs font-medium text-white hover:bg-red-600"
                >
                  לאישור מחיקה - לחצו שוב
                </button>
              ) : (
                <button
                  type="button"
                  onClick={() => setConfirmingDelete(true)}
                  className="flex-1 rounded-lg border border-red-200 px-2 py-1.5 text-xs font-medium text-red-500 transition-colors hover:bg-red-50 dark:border-red-900/40 dark:hover:bg-red-950/20"
                >
                  מחק קיט זה
                </button>
              )}
            </div>
          )}

          <ul className="flex flex-col gap-2">
            {tasks.map((task) => (
              <TaskCard
                key={task.id}
                task={task}
                showAssignee={false}
                selectionMode={selectionMode}
                selected={selectedIds.has(task.id)}
                onToggleSelect={onToggleSelect}
                onCycleStatus={onCycleStatus}
                onToggleDone={onToggleDone}
                onEdit={onEdit}
                onArchive={onArchiveItem}
              />
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

"use client";

import { useState } from "react";
import { ChevronDown, Pencil, Trash2 } from "lucide-react";
import {
  ASSIGNEE_OPTIONS,
  STATUS_CYCLE,
  STATUS_LEVELS,
  URGENCY_LEVELS,
  formatDueDate,
  isOverdue,
  type Task,
} from "@/lib/taskData";

export default function TaskCard({
  task,
  showAssignee,
  onCycleStatus,
  onEdit,
  onDelete,
}: {
  task: Task;
  showAssignee: boolean;
  onCycleStatus: (task: Task) => void;
  onEdit: (task: Task) => void;
  onDelete: (id: string) => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const urgency = URGENCY_LEVELS[task.urgency];
  const status = STATUS_LEVELS[task.status];
  const assigneeLabel = ASSIGNEE_OPTIONS.find((option) => option.value === task.assignee)?.label;
  const overdue = task.due_date ? isOverdue(task.due_date, task.status) : false;
  const hasDetails = Boolean(task.notes || task.category);

  function nextStatus() {
    const currentIndex = STATUS_CYCLE.indexOf(task.status);
    const next = STATUS_CYCLE[(currentIndex + 1) % STATUS_CYCLE.length];
    onCycleStatus({ ...task, status: next });
  }

  return (
    <li className="flex flex-col gap-2 rounded-2xl border border-amber-100 bg-white p-3 shadow-sm dark:border-amber-950/30 dark:bg-stone-900">
      <div className="flex items-start justify-between gap-2">
        <div className="flex flex-wrap items-center gap-1.5">
          <span className={`flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium ${urgency.color}`}>
            <span className={`h-1.5 w-1.5 rounded-full ${urgency.dot}`} />
            {urgency.label}
          </span>
          {showAssignee && assigneeLabel && (
            <span className="rounded-full bg-stone-100 px-2 py-0.5 text-xs font-medium text-stone-600 dark:bg-stone-800 dark:text-stone-300">
              {assigneeLabel}
            </span>
          )}
          {task.due_date && (
            <span
              className={`rounded-full px-2 py-0.5 text-xs font-medium ${
                overdue
                  ? "bg-rose-100 text-rose-700 dark:bg-rose-950/50 dark:text-rose-400"
                  : "bg-stone-100 text-stone-600 dark:bg-stone-800 dark:text-stone-300"
              }`}
            >
              {formatDueDate(task.due_date)}
            </span>
          )}
        </div>

        <div className="flex shrink-0 items-center gap-1">
          <button
            type="button"
            onClick={() => onEdit(task)}
            aria-label="עריכת משימה"
            className="rounded-full p-1.5 text-stone-400 transition-colors hover:bg-amber-100 hover:text-amber-600 dark:hover:bg-amber-950/40 dark:hover:text-amber-400"
          >
            <Pencil className="h-3.5 w-3.5" />
          </button>
          <button
            type="button"
            onClick={() => onDelete(task.id)}
            aria-label="מחיקת משימה"
            className="rounded-full p-1.5 text-stone-400 transition-colors hover:bg-red-50 hover:text-red-500 dark:hover:bg-red-950/30"
          >
            <Trash2 className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>

      <div className="flex items-start gap-3">
        {task.image_url && (
          // eslint-disable-next-line @next/next/no-img-element -- user-uploaded, arbitrary Supabase storage URL
          <img
            src={task.image_url}
            alt=""
            className="h-14 w-14 shrink-0 rounded-lg border border-amber-100 object-cover dark:border-amber-950/30"
          />
        )}
        <button
          type="button"
          onClick={() => hasDetails && setExpanded((value) => !value)}
          className={`flex flex-1 items-center justify-between gap-2 text-right ${hasDetails ? "cursor-pointer" : "cursor-default"}`}
        >
          <span
            className={`text-sm font-medium ${
              task.status === "done"
                ? "text-stone-400 line-through dark:text-stone-500"
                : "text-stone-800 dark:text-stone-100"
            }`}
          >
            {task.title}
          </span>
          {hasDetails && (
            <ChevronDown
              className={`h-4 w-4 shrink-0 text-stone-400 transition-transform ${expanded ? "rotate-180" : ""}`}
            />
          )}
        </button>
      </div>

      {expanded && hasDetails && (
        <div className="flex flex-col gap-1 rounded-xl bg-amber-50/60 p-2.5 text-xs text-stone-600 dark:bg-stone-950/40 dark:text-stone-300">
          {task.category && <p className="font-medium">{task.category}</p>}
          {task.notes && <p className="whitespace-pre-wrap">{task.notes}</p>}
        </div>
      )}

      <button
        type="button"
        onClick={nextStatus}
        className={`w-fit rounded-full px-3 py-1 text-xs font-medium transition-colors ${status.color}`}
      >
        {status.label}
      </button>
    </li>
  );
}

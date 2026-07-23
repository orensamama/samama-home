"use client";

import { memo, useState } from "react";
import { Archive, Check, ChevronDown, Pencil } from "lucide-react";
import {
  ASSIGNEE_TAGS,
  STATUS_CYCLE,
  STATUS_LEVELS,
  URGENCY_LEVELS,
  formatDueDate,
  isOverdue,
  type Task,
} from "@/lib/taskData";

function TaskCard({
  task,
  showAssignee,
  selectionMode,
  selected,
  onToggleSelect,
  onCycleStatus,
  onToggleDone,
  onEdit,
  onArchive,
}: {
  task: Task;
  showAssignee: boolean;
  selectionMode: boolean;
  selected: boolean;
  onToggleSelect: (id: string) => void;
  onCycleStatus: (task: Task) => void;
  onToggleDone: (task: Task) => void;
  onEdit: (task: Task) => void;
  onArchive: (task: Task) => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const urgency = URGENCY_LEVELS[task.urgency];
  const status = STATUS_LEVELS[task.status];
  const assigneeTag = ASSIGNEE_TAGS[task.assignee];
  const forMemberTag = task.for_member ? ASSIGNEE_TAGS[task.for_member] : null;
  const isDone = task.status === "done";
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
          {selectionMode && (
            <button
              type="button"
              onClick={() => onToggleSelect(task.id)}
              aria-label={selected ? "הסרה מהבחירה" : "הוספה לבחירה"}
              className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-md border-2 transition-colors ${
                selected
                  ? "border-amber-500 bg-amber-500 text-white"
                  : "border-stone-300 text-transparent dark:border-stone-600"
              }`}
            >
              <Check className="h-3 w-3" />
            </button>
          )}
          <span className={`flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium ${urgency.color}`}>
            <span className={`h-1.5 w-1.5 rounded-full ${urgency.dot}`} />
            {urgency.label}
          </span>
          {showAssignee && (
            <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${assigneeTag.color}`}>
              {assigneeTag.label}
            </span>
          )}
          {forMemberTag && (
            <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${forMemberTag.color}`}>
              עבור: {forMemberTag.label}
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

        {!selectionMode && (
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
              onClick={() => onArchive(task)}
              aria-label="העברה לארכיון"
              className="rounded-full p-1.5 text-stone-400 transition-colors hover:bg-stone-100 hover:text-stone-600 dark:hover:bg-stone-800 dark:hover:text-stone-300"
            >
              <Archive className="h-3.5 w-3.5" />
            </button>
          </div>
        )}
      </div>

      <div className="flex items-start gap-3">
        <button
          type="button"
          onClick={() => onToggleDone(task)}
          aria-label={isDone ? "בטל סימון כבוצע" : "סמן כבוצע"}
          className={`mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full border-2 transition-colors ${
            isDone
              ? "border-emerald-500 bg-emerald-500 text-white"
              : "border-stone-300 text-transparent hover:border-emerald-400 dark:border-stone-600"
          }`}
        >
          <Check className="h-3.5 w-3.5" />
        </button>
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
              isDone
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

      {!isDone && (
        <button
          type="button"
          onClick={nextStatus}
          className={`w-fit rounded-full px-3 py-1 text-xs font-medium transition-colors ${status.color}`}
        >
          {status.label}
        </button>
      )}
    </li>
  );
}

export default memo(TaskCard);

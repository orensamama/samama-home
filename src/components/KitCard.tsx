"use client";

import { memo, useEffect, useState, type FormEvent } from "react";
import { ChevronDown, Pencil, Plus } from "lucide-react";
import TaskCard from "@/components/TaskCard";
import ShareMenu from "@/components/ShareMenu";
import { CATEGORY_SUGGESTIONS, formatTasksForShare, type Task } from "@/lib/taskData";

type ItemActions = {
  selectionMode: boolean;
  selectedIds: Set<string>;
  onToggleSelect: (id: string) => void;
  onCycleStatus: (task: Task) => void;
  onToggleDone: (task: Task) => void;
  onEdit: (task: Task) => void;
  onArchiveItem: (task: Task) => void;
  onDeleteItem: (id: string) => void;
};

function KitCategorySection({
  instanceId,
  category,
  tasks,
  actions,
  onRenameCategory,
}: {
  instanceId: string;
  category: string;
  tasks: Task[];
  actions: ItemActions;
  onRenameCategory: (instanceId: string, oldCategory: string, newCategory: string) => void;
}) {
  const [expanded, setExpanded] = useState(true);
  const [renaming, setRenaming] = useState(false);
  const doneCount = tasks.filter((task) => task.status === "done").length;

  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex items-center gap-1">
        {renaming ? (
          <input
            type="text"
            defaultValue={category}
            autoFocus
            onBlur={(event) => {
              onRenameCategory(instanceId, category, event.target.value);
              setRenaming(false);
            }}
            onKeyDown={(event) => {
              if (event.key === "Enter") event.currentTarget.blur();
              if (event.key === "Escape") setRenaming(false);
            }}
            className="min-w-0 flex-1 rounded-lg border border-amber-300 bg-white px-2 py-1 text-xs font-semibold text-stone-700 outline-none dark:bg-stone-950 dark:text-stone-200"
          />
        ) : (
          <button
            type="button"
            onClick={() => setExpanded((value) => !value)}
            className="flex flex-1 items-center justify-between rounded-lg bg-amber-50/70 px-2 py-1.5 text-xs font-semibold text-stone-600 dark:bg-stone-800/60 dark:text-stone-300"
          >
            <span>{category}</span>
            <span className="flex items-center gap-1.5">
              <span className="text-[11px] font-normal text-stone-400 dark:text-stone-500">
                {doneCount}/{tasks.length}
              </span>
              <ChevronDown
                className={`h-3.5 w-3.5 transition-transform ${expanded ? "rotate-180" : ""}`}
              />
            </span>
          </button>
        )}
        {!renaming && (
          <button
            type="button"
            onClick={() => setRenaming(true)}
            aria-label="שינוי שם קטגוריה"
            className="shrink-0 rounded-full p-1 text-stone-400 hover:bg-amber-100 hover:text-amber-600 dark:hover:bg-amber-950/40 dark:hover:text-amber-400"
          >
            <Pencil className="h-3.5 w-3.5" />
          </button>
        )}
      </div>

      {expanded && (
        <ul className="flex flex-col gap-2 ps-1">
          {tasks.map((task) => (
            <TaskCard
              key={task.id}
              task={task}
              showAssignee={false}
              selectionMode={actions.selectionMode}
              selected={actions.selectedIds.has(task.id)}
              onToggleSelect={actions.onToggleSelect}
              onCycleStatus={actions.onCycleStatus}
              onToggleDone={actions.onToggleDone}
              onEdit={actions.onEdit}
              onArchive={actions.onArchiveItem}
              onDelete={actions.onDeleteItem}
            />
          ))}
        </ul>
      )}
    </div>
  );
}

function KitCard({
  instanceId,
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
  onRenameKit,
  onRenameCategory,
  onAddItem,
  onDeleteItem,
}: {
  instanceId: string;
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
  onRenameKit: (instanceId: string, newName: string) => void;
  onRenameCategory: (instanceId: string, oldCategory: string, newCategory: string) => void;
  onAddItem: (instanceId: string, kitName: string, title: string, category: string) => void;
  onDeleteItem: (id: string) => void;
}) {
  const [expanded, setExpanded] = useState(true);
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [renamingKit, setRenamingKit] = useState(false);
  const [newItemTitle, setNewItemTitle] = useState("");
  const [newItemCategory, setNewItemCategory] = useState("");

  useEffect(() => {
    if (!confirmingDelete) return;
    const timeout = setTimeout(() => setConfirmingDelete(false), 3000);
    return () => clearTimeout(timeout);
  }, [confirmingDelete]);

  const doneCount = tasks.filter((task) => task.status === "done").length;
  const total = tasks.length;
  const percent = total === 0 ? 0 : Math.round((doneCount / total) * 100);

  const categories = Array.from(new Set(tasks.map((task) => task.category ?? "כללי")));
  const actions: ItemActions = {
    selectionMode,
    selectedIds,
    onToggleSelect,
    onCycleStatus,
    onToggleDone,
    onEdit,
    onArchiveItem,
    onDeleteItem,
  };

  function handleAddItem(event: FormEvent) {
    event.preventDefault();
    const title = newItemTitle.trim();
    if (!title) return;
    onAddItem(instanceId, name, title, newItemCategory.trim());
    setNewItemTitle("");
  }

  return (
    <div className="rounded-2xl border border-amber-100 bg-white shadow-sm dark:border-amber-950/30 dark:bg-stone-900">
      <div className="flex w-full items-center gap-2 p-3">
        <button
          type="button"
          onClick={() => !renamingKit && setExpanded((value) => !value)}
          className="min-w-0 flex-1 text-right"
        >
          <div className="flex items-center justify-between gap-2">
            {renamingKit ? (
              <input
                type="text"
                defaultValue={name}
                autoFocus
                onClick={(event) => event.stopPropagation()}
                onBlur={(event) => {
                  onRenameKit(instanceId, event.target.value);
                  setRenamingKit(false);
                }}
                onKeyDown={(event) => {
                  if (event.key === "Enter") event.currentTarget.blur();
                  if (event.key === "Escape") setRenamingKit(false);
                }}
                className="min-w-0 flex-1 rounded-lg border border-amber-300 bg-white px-2 py-1 text-sm font-bold text-stone-800 outline-none dark:bg-stone-950 dark:text-stone-100"
              />
            ) : (
              <span className="truncate text-sm font-bold text-stone-800 dark:text-stone-100">{name}</span>
            )}
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
        </button>
        {!renamingKit && (
          <button
            type="button"
            onClick={() => setRenamingKit(true)}
            aria-label="שינוי שם קיט"
            className="shrink-0 rounded-full p-1.5 text-stone-400 hover:bg-amber-100 hover:text-amber-600 dark:hover:bg-amber-950/40 dark:hover:text-amber-400"
          >
            <Pencil className="h-3.5 w-3.5" />
          </button>
        )}
        <button
          type="button"
          onClick={() => setExpanded((value) => !value)}
          aria-label={expanded ? "כיווץ" : "הרחבה"}
          className="shrink-0 rounded-full p-1.5 text-stone-400 hover:bg-stone-100 dark:hover:bg-stone-800"
        >
          <ChevronDown
            className={`h-4 w-4 shrink-0 transition-transform ${expanded ? "rotate-180" : ""}`}
          />
        </button>
      </div>

      {expanded && (
        <div className="flex flex-col gap-3 border-t border-amber-100 p-3 dark:border-amber-950/30">
          {!selectionMode && (
            <div className="flex gap-2">
              <ShareMenu text={formatTasksForShare(tasks, name)} label="שיתוף" />
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

          {categories.map((category) => (
            <KitCategorySection
              key={category}
              instanceId={instanceId}
              category={category}
              tasks={tasks.filter((task) => (task.category ?? "כללי") === category)}
              actions={actions}
              onRenameCategory={onRenameCategory}
            />
          ))}

          {!selectionMode && (
            <form onSubmit={handleAddItem} className="flex flex-col gap-1.5 border-t border-dashed border-stone-200 pt-3 dark:border-stone-700">
              <p className="text-xs font-medium text-stone-500 dark:text-stone-400">הוספת פריט לקיט</p>
              <div className="flex gap-1.5">
                <input
                  type="text"
                  value={newItemTitle}
                  onChange={(event) => setNewItemTitle(event.target.value)}
                  placeholder="שם הפריט..."
                  className="min-w-0 flex-1 rounded-lg border border-stone-200 bg-white px-2 py-1.5 text-sm text-stone-700 outline-none focus:border-amber-400 dark:border-stone-700 dark:bg-stone-950 dark:text-stone-200"
                />
                <input
                  type="text"
                  list="kit-category-suggestions"
                  value={newItemCategory}
                  onChange={(event) => setNewItemCategory(event.target.value)}
                  placeholder="קטגוריה..."
                  className="w-24 shrink-0 rounded-lg border border-stone-200 bg-white px-2 py-1.5 text-sm text-stone-700 outline-none focus:border-amber-400 dark:border-stone-700 dark:bg-stone-950 dark:text-stone-200"
                />
                <button
                  type="submit"
                  disabled={!newItemTitle.trim()}
                  aria-label="הוספת פריט"
                  className="shrink-0 rounded-lg bg-amber-500 px-3 py-1.5 text-sm font-medium text-white transition-colors hover:bg-amber-600 disabled:opacity-50"
                >
                  <Plus className="h-4 w-4" />
                </button>
              </div>
              <datalist id="kit-category-suggestions">
                {categories.map((category) => (
                  <option key={category} value={category === "כללי" ? "" : category} />
                ))}
                {CATEGORY_SUGGESTIONS.map((suggestion) => (
                  <option key={suggestion} value={suggestion} />
                ))}
              </datalist>
            </form>
          )}
        </div>
      )}
    </div>
  );
}

export default memo(KitCard);

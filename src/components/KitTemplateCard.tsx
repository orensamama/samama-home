"use client";

import { memo, useEffect, useState, type FormEvent } from "react";
import { ChevronDown, Pencil, Play, Plus, Trash2 } from "lucide-react";
import { CATEGORY_SUGGESTIONS, type Task } from "@/lib/taskData";

const GENERAL_CATEGORY = "כללי";

type TemplateItemPatch = { title?: string; category?: string | null };

function TemplateCategorySection({
  kitName,
  category,
  categories,
  tasks,
  onRenameCategory,
  onUpdateItem,
  onDeleteItem,
}: {
  kitName: string;
  category: string;
  categories: string[];
  tasks: Task[];
  onRenameCategory: (kitName: string, oldCategory: string, newCategory: string) => void;
  onUpdateItem: (id: string, patch: TemplateItemPatch) => void;
  onDeleteItem: (id: string) => void;
}) {
  const [renaming, setRenaming] = useState(false);

  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex items-center gap-1">
        {renaming ? (
          <input
            type="text"
            defaultValue={category}
            autoFocus
            onBlur={(event) => {
              onRenameCategory(kitName, category, event.target.value);
              setRenaming(false);
            }}
            onKeyDown={(event) => {
              if (event.key === "Enter") event.currentTarget.blur();
              if (event.key === "Escape") setRenaming(false);
            }}
            className="min-w-0 flex-1 rounded-lg border border-amber-300 bg-white px-2 py-1 text-xs font-semibold text-stone-700 outline-none dark:bg-stone-950 dark:text-stone-200"
          />
        ) : (
          <span className="flex flex-1 items-center justify-between rounded-lg bg-amber-50/70 px-2 py-1.5 text-xs font-semibold text-stone-600 dark:bg-stone-800/60 dark:text-stone-300">
            <span>{category}</span>
            <span className="text-[11px] font-normal text-stone-400 dark:text-stone-500">{tasks.length}</span>
          </span>
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

      <ul className="flex flex-col gap-1 ps-1">
        {tasks.map((task) => (
          <li
            key={task.id}
            className="flex items-center gap-1.5 rounded-lg border border-stone-200 bg-white px-2 py-1 dark:border-stone-700 dark:bg-stone-950"
          >
            <input
              type="text"
              defaultValue={task.title}
              onBlur={(event) => {
                const title = event.target.value.trim();
                if (title && title !== task.title) onUpdateItem(task.id, { title });
                else event.target.value = task.title;
              }}
              onKeyDown={(event) => {
                if (event.key === "Enter") event.currentTarget.blur();
              }}
              className="min-w-0 flex-1 bg-transparent text-sm text-stone-700 outline-none dark:text-stone-200"
            />
            <select
              value={task.category ?? GENERAL_CATEGORY}
              onChange={(event) =>
                onUpdateItem(task.id, {
                  category: event.target.value === GENERAL_CATEGORY ? null : event.target.value,
                })
              }
              aria-label="העברה לקטגוריה אחרת"
              className="max-w-[7rem] shrink-0 rounded-md border border-stone-200 bg-transparent px-1 py-0.5 text-[11px] text-stone-500 outline-none focus:border-amber-400 dark:border-stone-700 dark:text-stone-400"
            >
              {categories.map((option) => (
                <option key={option} value={option}>
                  {option}
                </option>
              ))}
            </select>
            <button
              type="button"
              onClick={() => onDeleteItem(task.id)}
              aria-label="מחיקת פריט"
              className="shrink-0 rounded-full p-1 text-stone-400 hover:bg-red-50 hover:text-red-500 dark:hover:bg-red-950/30"
            >
              <Trash2 className="h-3.5 w-3.5" />
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}

/**
 * A saved kit (template) -- the reusable definition from which active kits
 * are loaded. Full CRUD lives here too: rename the kit and its categories,
 * add/rename/move/delete items, or delete the whole kit.
 */
function KitTemplateCard({
  name,
  tasks,
  onActivate,
  onRename,
  onRenameCategory,
  onAddItem,
  onUpdateItem,
  onDeleteItem,
  onDeleteKit,
}: {
  name: string;
  tasks: Task[];
  onActivate: (name: string) => void;
  onRename: (oldName: string, newName: string) => void;
  onRenameCategory: (kitName: string, oldCategory: string, newCategory: string) => void;
  onAddItem: (kitName: string, title: string, category: string) => void;
  onUpdateItem: (id: string, patch: TemplateItemPatch) => void;
  onDeleteItem: (id: string) => void;
  onDeleteKit: (kitName: string) => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const [renaming, setRenaming] = useState(false);
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [newItemTitle, setNewItemTitle] = useState("");
  const [newItemCategory, setNewItemCategory] = useState("");

  useEffect(() => {
    if (!confirmingDelete) return;
    const timeout = setTimeout(() => setConfirmingDelete(false), 3000);
    return () => clearTimeout(timeout);
  }, [confirmingDelete]);

  const categories = Array.from(new Set(tasks.map((task) => task.category ?? GENERAL_CATEGORY)));

  function handleAddItem(event: FormEvent) {
    event.preventDefault();
    const title = newItemTitle.trim();
    if (!title) return;
    onAddItem(name, title, newItemCategory.trim());
    setNewItemTitle("");
  }

  return (
    <div className="rounded-2xl border border-amber-100 bg-white shadow-sm dark:border-amber-950/30 dark:bg-stone-900">
      <div className="flex items-center gap-2 p-3">
        <button
          type="button"
          onClick={() => !renaming && setExpanded((value) => !value)}
          className="min-w-0 flex-1 text-right"
        >
          {renaming ? (
            <input
              type="text"
              defaultValue={name}
              autoFocus
              onClick={(event) => event.stopPropagation()}
              onBlur={(event) => {
                onRename(name, event.target.value);
                setRenaming(false);
              }}
              onKeyDown={(event) => {
                if (event.key === "Enter") event.currentTarget.blur();
                if (event.key === "Escape") setRenaming(false);
              }}
              className="w-full rounded-lg border border-amber-300 bg-white px-2 py-1 text-sm font-bold text-stone-800 outline-none dark:bg-stone-950 dark:text-stone-100"
            />
          ) : (
            <>
              <span className="block truncate text-sm font-bold text-stone-800 dark:text-stone-100">{name}</span>
              <span className="block text-xs text-stone-500 dark:text-stone-400">
                {tasks.length} פריטים · {categories.length} קטגוריות
              </span>
            </>
          )}
        </button>
        {!renaming && (
          <button
            type="button"
            onClick={() => setRenaming(true)}
            aria-label="שינוי שם קיט"
            className="shrink-0 rounded-full p-1.5 text-stone-400 hover:bg-amber-100 hover:text-amber-600 dark:hover:bg-amber-950/40 dark:hover:text-amber-400"
          >
            <Pencil className="h-3.5 w-3.5" />
          </button>
        )}
        <button
          type="button"
          onClick={() => onActivate(name)}
          className="flex shrink-0 items-center gap-1 rounded-lg bg-amber-500 px-2.5 py-1.5 text-xs font-semibold text-white transition-colors hover:bg-amber-600"
        >
          <Play className="h-3.5 w-3.5" />
          הפעל קיט
        </button>
        <button
          type="button"
          onClick={() => setExpanded((value) => !value)}
          aria-label={expanded ? "כיווץ" : "עריכת הקיט"}
          className="shrink-0 rounded-full p-1.5 text-stone-400 hover:bg-stone-100 dark:hover:bg-stone-800"
        >
          <ChevronDown className={`h-4 w-4 transition-transform ${expanded ? "rotate-180" : ""}`} />
        </button>
      </div>

      {expanded && (
        <div className="flex flex-col gap-3 border-t border-amber-100 p-3 dark:border-amber-950/30">
          {categories.map((category) => (
            <TemplateCategorySection
              key={category}
              kitName={name}
              category={category}
              categories={categories}
              tasks={tasks.filter((task) => (task.category ?? GENERAL_CATEGORY) === category)}
              onRenameCategory={onRenameCategory}
              onUpdateItem={onUpdateItem}
              onDeleteItem={onDeleteItem}
            />
          ))}

          <form
            onSubmit={handleAddItem}
            className="flex flex-col gap-1.5 border-t border-dashed border-stone-200 pt-3 dark:border-stone-700"
          >
            <p className="text-xs font-medium text-stone-500 dark:text-stone-400">הוספת פריט לקיט השמור</p>
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
                list={`kit-template-categories-${name}`}
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
            <datalist id={`kit-template-categories-${name}`}>
              {categories
                .filter((category) => category !== GENERAL_CATEGORY)
                .map((category) => (
                  <option key={category} value={category} />
                ))}
              {CATEGORY_SUGGESTIONS.map((suggestion) => (
                <option key={suggestion} value={suggestion} />
              ))}
            </datalist>
          </form>

          {confirmingDelete ? (
            <button
              type="button"
              onClick={() => onDeleteKit(name)}
              className="rounded-lg bg-red-500 px-2 py-1.5 text-xs font-medium text-white hover:bg-red-600"
            >
              לאישור מחיקת הקיט השמור - לחצו שוב
            </button>
          ) : (
            <button
              type="button"
              onClick={() => setConfirmingDelete(true)}
              className="rounded-lg border border-red-200 px-2 py-1.5 text-xs font-medium text-red-500 transition-colors hover:bg-red-50 dark:border-red-900/40 dark:hover:bg-red-950/20"
            >
              מחק קיט שמור זה
            </button>
          )}
        </div>
      )}
    </div>
  );
}

export default memo(KitTemplateCard);

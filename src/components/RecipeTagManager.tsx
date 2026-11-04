"use client";

import { useEffect, useState, type FormEvent } from "react";
import { Plus, Trash2, X } from "lucide-react";
import SetupSqlButton from "@/components/SetupSqlButton";
import { SUGGESTED_TAGS, emojiForTag } from "@/lib/recipeData";

function TagRow({
  name,
  count,
  onRename,
  onDelete,
}: {
  name: string;
  count: number;
  onRename: (name: string) => void;
  onDelete: () => void;
}) {
  const [armed, setArmed] = useState(false);

  useEffect(() => {
    if (!armed) return;
    const timeout = setTimeout(() => setArmed(false), 3000);
    return () => clearTimeout(timeout);
  }, [armed]);

  return (
    <li className="flex items-center gap-2 py-1.5">
      <span className="shrink-0 text-lg" aria-hidden="true">
        {emojiForTag(name)}
      </span>
      <input
        type="text"
        key={name}
        defaultValue={name}
        aria-label={`שם התגית ${name}`}
        onBlur={(event) => {
          const next = event.target.value.trim();
          if (next && next !== name) onRename(next);
          else event.target.value = name;
        }}
        onKeyDown={(event) => {
          if (event.key === "Enter") event.currentTarget.blur();
        }}
        className="min-w-0 flex-1 rounded-lg border border-transparent bg-stone-50 px-2 py-1.5 text-sm text-stone-700 outline-none focus:border-amber-400 dark:bg-stone-800/60 dark:text-stone-200"
      />
      <span className="shrink-0 text-xs tabular-nums text-stone-400">{count} מתכונים</span>
      {armed ? (
        <button
          type="button"
          onClick={onDelete}
          className="shrink-0 rounded-lg bg-red-500 px-2 py-1 text-[11px] font-medium text-white hover:bg-red-600"
        >
          לחצו שוב למחיקה
        </button>
      ) : (
        <button
          type="button"
          onClick={() => setArmed(true)}
          aria-label={`מחיקת התגית ${name}`}
          className="shrink-0 rounded-full p-1.5 text-stone-400 hover:bg-red-50 hover:text-red-500 dark:hover:bg-red-950/30"
        >
          <Trash2 className="h-3.5 w-3.5" />
        </button>
      )}
    </li>
  );
}

/** Add, rename and delete the family's recipe categories/tags. Renames and deletes reach every recipe. */
export default function RecipeTagManager({
  tags,
  counts,
  error,
  onAdd,
  onRename,
  onDelete,
  onClose,
}: {
  tags: string[];
  /** tag name -> how many recipes carry it */
  counts: Map<string, number>;
  /** Set when a new tag couldn't be saved to the database (it still works for now). */
  error?: { message: string; needsSql: boolean } | null;
  onAdd: (name: string) => void;
  onRename: (oldName: string, newName: string) => void;
  onDelete: (name: string) => void;
  onClose: () => void;
}) {
  const [draft, setDraft] = useState("");
  const missing = SUGGESTED_TAGS.filter((tag) => !tags.includes(tag));

  function handleAdd(event: FormEvent) {
    event.preventDefault();
    const name = draft.trim();
    if (!name || tags.includes(name)) return;
    onAdd(name);
    setDraft("");
  }

  return (
    <div className="fixed inset-0 z-[60] flex items-end justify-center bg-black/40 sm:items-center">
      <div className="flex max-h-[90dvh] w-full flex-col overflow-hidden rounded-t-3xl bg-white shadow-lg sm:max-w-md sm:rounded-3xl dark:bg-stone-900">
        <div className="flex shrink-0 items-center justify-between border-b border-amber-100 p-4 dark:border-amber-950/30">
          <h2 className="text-lg font-bold text-stone-800 dark:text-stone-100">ניהול קטגוריות ותגיות</h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="סגירה"
            className="rounded-full p-1.5 text-stone-400 hover:bg-stone-100 dark:hover:bg-stone-800"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="flex flex-1 flex-col gap-3 overflow-y-auto p-4">
          <p className="text-xs text-stone-500 dark:text-stone-400">
            שינוי שם מתעדכן בכל המתכונים. מחיקת תגית מסירה אותה מהמתכונים - המתכונים עצמם נשארים.
          </p>

          {error && (
            <div className="flex flex-col gap-2 rounded-xl bg-amber-50 p-3 text-xs text-amber-800 dark:bg-amber-950/20 dark:text-amber-300">
              <p>{error.message}</p>
              {error.needsSql && <SetupSqlButton />}
            </div>
          )}

          <form onSubmit={handleAdd} className="flex gap-1.5">
            <input
              type="text"
              value={draft}
              onChange={(event) => setDraft(event.target.value)}
              placeholder="תגית חדשה..."
              className="min-w-0 flex-1 rounded-lg border border-stone-200 bg-white px-2.5 py-2 text-sm text-stone-700 outline-none focus:border-amber-400 dark:border-stone-700 dark:bg-stone-950 dark:text-stone-200"
            />
            <button
              type="submit"
              disabled={!draft.trim() || tags.includes(draft.trim())}
              aria-label="הוספת תגית"
              className="shrink-0 rounded-lg bg-amber-500 px-3 text-white transition-colors hover:bg-amber-600 disabled:opacity-50"
            >
              <Plus className="h-4 w-4" />
            </button>
          </form>

          {tags.length === 0 ? (
            <p className="text-sm text-stone-400">עדיין אין תגיות.</p>
          ) : (
            <ul className="divide-y divide-stone-100 dark:divide-stone-800">
              {tags.map((tag) => (
                <TagRow
                  key={tag}
                  name={tag}
                  count={counts.get(tag) ?? 0}
                  onRename={(next) => onRename(tag, next)}
                  onDelete={() => onDelete(tag)}
                />
              ))}
            </ul>
          )}

          {missing.length > 0 && (
            <div className="border-t border-dashed border-stone-200 pt-3 dark:border-stone-700">
              <p className="mb-1.5 text-xs font-medium text-stone-500 dark:text-stone-400">תגיות מוצעות - לחיצה מוסיפה</p>
              <div className="flex flex-wrap gap-1.5">
                {missing.map((tag) => (
                  <button
                    key={tag}
                    type="button"
                    onClick={() => onAdd(tag)}
                    className="rounded-full border border-dashed border-amber-300 px-3 py-1 text-xs text-amber-700 hover:bg-amber-50 dark:border-amber-800 dark:text-amber-400 dark:hover:bg-stone-800"
                  >
                    {emojiForTag(tag)} + {tag}
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

"use client";

import { useState, type FormEvent } from "react";
import { Plus } from "lucide-react";

/** Multi-select tag chips (a recipe can carry any number of categories) with an inline "new tag". */
export default function RecipeTagPicker({
  allTags,
  selected,
  onChange,
  onCreate,
}: {
  allTags: string[];
  selected: string[];
  onChange: (tags: string[]) => void;
  /** Called when a brand-new tag is typed, so it can be saved to the family's tag list. */
  onCreate?: (name: string) => void;
}) {
  const [draft, setDraft] = useState("");
  // Selected tags that aren't in the list yet (just created) still show.
  const names = Array.from(new Set([...allTags, ...selected]));

  function toggle(name: string) {
    onChange(selected.includes(name) ? selected.filter((tag) => tag !== name) : [...selected, name]);
  }

  function handleCreate(event: FormEvent) {
    event.preventDefault();
    const name = draft.trim();
    if (!name) return;
    if (!names.includes(name)) onCreate?.(name);
    if (!selected.includes(name)) onChange([...selected, name]);
    setDraft("");
  }

  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap gap-1.5">
        {names.map((name) => {
          const on = selected.includes(name);
          return (
            <button
              key={name}
              type="button"
              onClick={() => toggle(name)}
              aria-pressed={on}
              className={`rounded-full border px-3 py-1 text-xs font-medium transition-colors ${
                on
                  ? "border-amber-500 bg-amber-500 text-white"
                  : "border-amber-200 bg-white text-stone-600 hover:bg-amber-50 dark:border-amber-900/50 dark:bg-stone-900 dark:text-stone-300"
              }`}
            >
              {name}
            </button>
          );
        })}
        {names.length === 0 && <p className="text-xs text-stone-400">עדיין אין תגיות - הוסיפו את הראשונה למטה.</p>}
      </div>
      <form onSubmit={handleCreate} className="flex gap-1.5">
        <input
          type="text"
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          placeholder="תגית חדשה (למשל: ארוחת שישי)..."
          className="min-w-0 flex-1 rounded-lg border border-dashed border-stone-300 bg-transparent px-2.5 py-1.5 text-xs text-stone-700 outline-none focus:border-amber-400 dark:border-stone-700 dark:text-stone-200"
        />
        <button
          type="submit"
          disabled={!draft.trim()}
          aria-label="הוספת תגית"
          className="shrink-0 rounded-lg border border-dashed border-stone-300 px-2 text-stone-500 hover:bg-stone-50 disabled:opacity-40 dark:border-stone-700 dark:hover:bg-stone-800"
        >
          <Plus className="h-3.5 w-3.5" />
        </button>
      </form>
    </div>
  );
}

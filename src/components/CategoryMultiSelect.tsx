"use client";

import { useMemo, useState } from "react";
import { ChevronDown } from "lucide-react";
import { KIND_META, type BudgetCategory, type BudgetKind } from "@/lib/budgetData";

// Same order as the expense form's picker: everyday spending first.
const ORDER: BudgetKind[] = ["variable", "fixed", "income", "sinking"];

/**
 * Pick any number of budget categories with checkboxes (e.g. "סופר/מזון" +
 * "סופר פארם" together). Collapsed it's a single button showing the selection.
 */
export default function CategoryMultiSelect({
  categories,
  selected,
  onChange,
  className = "",
}: {
  categories: BudgetCategory[];
  selected: string[];
  onChange: (ids: string[]) => void;
  className?: string;
}) {
  const [open, setOpen] = useState(false);

  const groups = useMemo(
    () =>
      ORDER.map((kind) => {
        const ofKind = categories.filter(
          (category) => category.kind === kind && (!category.is_hidden || selected.includes(category.id))
        );
        const names = Array.from(new Set(ofKind.map((category) => category.group_name)));
        return {
          kind,
          groups: names.map((name) => ({ name, items: ofKind.filter((category) => category.group_name === name) })),
        };
      }).filter((entry) => entry.groups.length > 0),
    [categories, selected]
  );

  const label =
    selected.length === 0
      ? "כל הקטגוריות"
      : selected.length === 1
        ? (categories.find((category) => category.id === selected[0])?.name ?? "קטגוריה אחת")
        : `${selected.length} קטגוריות`;

  function toggle(id: string) {
    onChange(selected.includes(id) ? selected.filter((value) => value !== id) : [...selected, id]);
  }

  return (
    <div className="flex flex-col gap-1.5">
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        aria-expanded={open}
        aria-label="סינון לפי קטגוריות (בחירה מרובה)"
        className={`flex items-center justify-between gap-1 text-right ${className}`}
      >
        <span className={`min-w-0 flex-1 truncate ${selected.length > 0 ? "font-semibold text-amber-700 dark:text-amber-400" : ""}`}>
          {label}
        </span>
        <ChevronDown className={`h-3.5 w-3.5 shrink-0 text-stone-400 transition-transform ${open ? "rotate-180" : ""}`} />
      </button>

      {open && (
        <div className="max-h-64 overflow-y-auto rounded-xl border border-amber-200 bg-white p-2 dark:border-amber-900/50 dark:bg-stone-950">
          <div className="mb-1 flex items-center justify-between text-[11px]">
            <span className="text-stone-400">אפשר לסמן כמה קטגוריות יחד</span>
            {selected.length > 0 && (
              <button
                type="button"
                onClick={() => onChange([])}
                className="font-medium text-amber-600 hover:underline dark:text-amber-400"
              >
                נקה בחירה
              </button>
            )}
          </div>
          {groups.map(({ kind, groups: kindGroups }) => (
            <div key={kind} className="pt-1.5">
              <p className="text-[11px] font-bold text-stone-500 dark:text-stone-400">{KIND_META[kind].short}</p>
              {kindGroups.map(({ name, items }) => (
                <div key={name} className="pb-0.5">
                  <p className="pt-1 text-[10px] text-stone-400 dark:text-stone-500">{name}</p>
                  <div className="grid grid-cols-2 gap-x-2">
                    {items.map((category) => (
                      <label
                        key={category.id}
                        className="flex cursor-pointer items-center gap-1.5 rounded-lg px-1 py-1 text-xs text-stone-700 hover:bg-amber-50 dark:text-stone-200 dark:hover:bg-stone-800"
                      >
                        <input
                          type="checkbox"
                          checked={selected.includes(category.id)}
                          onChange={() => toggle(category.id)}
                        />
                        <span className="min-w-0 truncate">{category.name}</span>
                      </label>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

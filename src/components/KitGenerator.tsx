"use client";

import { useState } from "react";
import type { PostgrestError } from "@supabase/supabase-js";
import { ArrowRight, Check, LayoutTemplate, Plus, X } from "lucide-react";
import type { Assignee, Task, Urgency } from "@/lib/taskData";
import ErrorBanner from "@/components/ErrorBanner";

export type TemplateGroup = {
  name: string;
  tasks: Task[];
};

export type KitItem = {
  title: string;
  assignee: Assignee;
  category: string | null;
  urgency: Urgency;
  notes: string | null;
};

type EditableItem = {
  id: string;
  title: string;
  assignee: Assignee;
  category: string;
  urgency: Urgency;
  notes: string | null;
  selected: boolean;
};

function toEditableItems(group: TemplateGroup): EditableItem[] {
  return group.tasks.map((task) => ({
    id: task.id,
    title: task.title,
    assignee: task.assignee,
    category: task.category ?? "כללי",
    urgency: task.urgency,
    notes: task.notes,
    selected: true,
  }));
}

export default function KitGenerator({
  templateGroups,
  onClose,
  onConfirm,
}: {
  templateGroups: TemplateGroup[];
  onClose: () => void;
  onConfirm: (items: KitItem[]) => Promise<PostgrestError | null>;
}) {
  const [selectedGroup, setSelectedGroup] = useState<TemplateGroup | null>(null);
  const [items, setItems] = useState<EditableItem[]>([]);
  const [newItemText, setNewItemText] = useState<Record<string, string>>({});
  const [confirming, setConfirming] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function openGroup(group: TemplateGroup) {
    setSelectedGroup(group);
    setItems(toEditableItems(group));
    setError(null);
  }

  function toggleItem(id: string) {
    setItems((prev) => prev.map((item) => (item.id === id ? { ...item, selected: !item.selected } : item)));
  }

  function updateTitle(id: string, title: string) {
    setItems((prev) => prev.map((item) => (item.id === id ? { ...item, title } : item)));
  }

  function toggleCategoryAll(category: string) {
    setItems((prev) => {
      const categoryItems = prev.filter((item) => item.category === category);
      const allSelected = categoryItems.every((item) => item.selected);
      return prev.map((item) =>
        item.category === category ? { ...item, selected: !allSelected } : item
      );
    });
  }

  function addCustomItem(category: string, assignee: Assignee) {
    const text = (newItemText[category] ?? "").trim();
    if (!text) return;
    setItems((prev) => [
      ...prev,
      {
        id: crypto.randomUUID(),
        title: text,
        assignee,
        category,
        urgency: "medium",
        notes: null,
        selected: true,
      },
    ]);
    setNewItemText((prev) => ({ ...prev, [category]: "" }));
  }

  async function handleConfirm() {
    const selectedItems = items.filter((item) => item.selected && item.title.trim());
    if (selectedItems.length === 0 || confirming) return;
    setConfirming(true);
    setError(null);
    const payload: KitItem[] = selectedItems.map((item) => ({
      title: item.title.trim(),
      assignee: item.assignee,
      category: item.category,
      urgency: item.urgency,
      notes: item.notes,
    }));
    const err = await onConfirm(payload);
    setConfirming(false);
    if (err) {
      setError(err.message);
      return;
    }
    onClose();
  }

  const categories = Array.from(new Set(items.map((item) => item.category)));
  const selectedCount = items.filter((item) => item.selected).length;

  return (
    <div className="fixed inset-0 z-[60] flex items-end justify-center bg-black/40 sm:items-center">
      <div className="flex max-h-[85dvh] w-full flex-col overflow-hidden rounded-t-3xl bg-white shadow-lg sm:max-w-md sm:rounded-3xl dark:bg-stone-900">
        <div className="flex shrink-0 items-center justify-between border-b border-amber-100 p-4 dark:border-amber-950/30">
          <div className="flex items-center gap-2">
            {selectedGroup && (
              <button
                type="button"
                onClick={() => setSelectedGroup(null)}
                aria-label="חזרה לבחירת קיט"
                className="rounded-full p-1.5 text-stone-400 hover:bg-stone-100 dark:hover:bg-stone-800"
              >
                <ArrowRight className="h-4 w-4" />
              </button>
            )}
            <h2 className="text-lg font-bold text-stone-800 dark:text-stone-100">
              {selectedGroup ? selectedGroup.name : "צור רשימה מקיט"}
            </h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="סגירה"
            className="rounded-full p-1.5 text-stone-400 hover:bg-stone-100 dark:hover:bg-stone-800"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {!selectedGroup ? (
          <div className="flex-1 overflow-y-auto p-4">
            {templateGroups.length === 0 ? (
              <p className="rounded-2xl border border-dashed border-amber-200 p-6 text-center text-sm text-stone-500 dark:border-amber-900/40 dark:text-stone-400">
                אין קיטים זמינים.
              </p>
            ) : (
              <div className="flex flex-col gap-2">
                {templateGroups.map((group) => (
                  <button
                    key={group.name}
                    type="button"
                    onClick={() => openGroup(group)}
                    className="flex items-center gap-3 rounded-2xl border border-amber-100 bg-white p-3 text-right shadow-sm transition-colors hover:bg-amber-50 dark:border-amber-950/30 dark:bg-stone-950 dark:hover:bg-stone-800"
                  >
                    <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-amber-100 text-amber-600 dark:bg-amber-950/50 dark:text-amber-400">
                      <LayoutTemplate className="h-4.5 w-4.5" />
                    </span>
                    <span>
                      <span className="block text-sm font-medium text-stone-800 dark:text-stone-100">
                        {group.name}
                      </span>
                      <span className="block text-xs text-stone-500 dark:text-stone-400">
                        {group.tasks.length} פריטים
                      </span>
                    </span>
                  </button>
                ))}
              </div>
            )}
          </div>
        ) : (
          <>
            <div className="flex flex-1 flex-col gap-4 overflow-y-auto p-4">
              {error && <ErrorBanner message={error} onDismiss={() => setError(null)} />}

              {categories.map((category) => {
                const categoryItems = items.filter((item) => item.category === category);
                const allSelected = categoryItems.every((item) => item.selected);
                const categoryAssignee = categoryItems[0]?.assignee ?? "Shared";

                return (
                  <div key={category} className="flex flex-col gap-2">
                    <div className="flex items-center justify-between">
                      <h3 className="text-sm font-bold text-stone-700 dark:text-stone-200">{category}</h3>
                      <button
                        type="button"
                        onClick={() => toggleCategoryAll(category)}
                        className="text-xs font-medium text-amber-600 hover:underline dark:text-amber-400"
                      >
                        {allSelected ? "בטל הכל" : "בחר הכל"}
                      </button>
                    </div>

                    <ul className="flex flex-col gap-1.5">
                      {categoryItems.map((item) => (
                        <li key={item.id} className="flex items-center gap-2">
                          <button
                            type="button"
                            onClick={() => toggleItem(item.id)}
                            aria-label={item.selected ? "הסרה מהבחירה" : "הוספה לבחירה"}
                            className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-md border-2 transition-colors ${
                              item.selected
                                ? "border-amber-500 bg-amber-500 text-white"
                                : "border-stone-300 text-transparent dark:border-stone-600"
                            }`}
                          >
                            <Check className="h-3 w-3" />
                          </button>
                          <input
                            type="text"
                            value={item.title}
                            onChange={(event) => updateTitle(item.id, event.target.value)}
                            className={`min-w-0 flex-1 rounded-lg border border-transparent bg-transparent px-2 py-1 text-sm outline-none focus:border-amber-300 focus:bg-white dark:focus:bg-stone-950 ${
                              item.selected
                                ? "text-stone-800 dark:text-stone-100"
                                : "text-stone-400 line-through dark:text-stone-600"
                            }`}
                          />
                        </li>
                      ))}
                    </ul>

                    <div className="flex gap-1.5 ps-7">
                      <input
                        type="text"
                        value={newItemText[category] ?? ""}
                        onChange={(event) =>
                          setNewItemText((prev) => ({ ...prev, [category]: event.target.value }))
                        }
                        onKeyDown={(event) => {
                          if (event.key === "Enter") {
                            event.preventDefault();
                            addCustomItem(category, categoryAssignee);
                          }
                        }}
                        placeholder="הוספת פריט..."
                        className="min-w-0 flex-1 rounded-lg border border-dashed border-stone-300 bg-transparent px-2 py-1 text-xs text-stone-600 outline-none focus:border-amber-400 dark:border-stone-700 dark:text-stone-300"
                      />
                      <button
                        type="button"
                        onClick={() => addCustomItem(category, categoryAssignee)}
                        aria-label="הוספת פריט לקטגוריה"
                        className="rounded-lg border border-dashed border-stone-300 px-2 text-stone-500 hover:bg-stone-50 dark:border-stone-700 dark:text-stone-400 dark:hover:bg-stone-800"
                      >
                        <Plus className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>

            <div className="shrink-0 border-t border-amber-100 bg-white p-4 dark:border-amber-950/30 dark:bg-stone-900">
              <button
                type="button"
                onClick={handleConfirm}
                disabled={selectedCount === 0 || confirming}
                className="w-full rounded-xl bg-amber-500 px-4 py-3 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-amber-600 disabled:opacity-50"
              >
                {confirming ? "טוען…" : `אישור וטעינה (${selectedCount})`}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

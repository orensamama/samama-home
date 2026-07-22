"use client";

import { useState } from "react";
import type { PostgrestError } from "@supabase/supabase-js";
import { ArrowRight, Check, LayoutTemplate, Plus, Trash2, X } from "lucide-react";
import type { Task, Urgency } from "@/lib/taskData";
import { friendlyErrorMessage } from "@/lib/supabaseErrors";
import ErrorBanner from "@/components/ErrorBanner";

export type TemplateGroup = {
  name: string;
  tasks: Task[];
};

// Kit items are intentionally unassigned (no Oren/Orit/Hadar/Ziv) -- they
// always land as Shared. Grouping by kit_instance_id (assigned by the
// caller) is what keeps them organized, not per-item assignee.
export type KitItem = {
  title: string;
  category: string | null;
  urgency: Urgency;
  notes: string | null;
};

export type NewKitItem = {
  title: string;
  category: string;
};

type EditableItem = {
  id: string;
  title: string;
  category: string;
  urgency: Urgency;
  notes: string | null;
  selected: boolean;
};

type DraftItem = { id: string; title: string };
type DraftCategory = { id: string; name: string; items: DraftItem[] };

function toEditableItems(group: TemplateGroup): EditableItem[] {
  return group.tasks.map((task) => ({
    id: task.id,
    title: task.title,
    category: task.category ?? "כללי",
    urgency: task.urgency,
    notes: task.notes,
    selected: true,
  }));
}

function emptyDraftItem(): DraftItem {
  return { id: crypto.randomUUID(), title: "" };
}

function emptyDraftCategory(): DraftCategory {
  return { id: crypto.randomUUID(), name: "", items: [emptyDraftItem()] };
}

type View = "list" | "editItems" | "createKit";

export default function KitGenerator({
  templateGroups,
  onClose,
  onConfirm,
  onCreateKit,
}: {
  templateGroups: TemplateGroup[];
  onClose: () => void;
  onConfirm: (kitName: string, items: KitItem[]) => Promise<PostgrestError | null>;
  onCreateKit: (kitName: string, items: NewKitItem[]) => Promise<PostgrestError | null>;
}) {
  const [view, setView] = useState<View>("list");
  const [selectedGroup, setSelectedGroup] = useState<TemplateGroup | null>(null);
  const [items, setItems] = useState<EditableItem[]>([]);
  const [newItemText, setNewItemText] = useState<Record<string, string>>({});
  const [confirming, setConfirming] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [draftName, setDraftName] = useState("");
  const [draftCategories, setDraftCategories] = useState<DraftCategory[]>([emptyDraftCategory()]);
  const [savingKit, setSavingKit] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);

  function openGroup(group: TemplateGroup) {
    setSelectedGroup(group);
    setItems(toEditableItems(group));
    setError(null);
    setView("editItems");
  }

  function openCreateKit() {
    setDraftName("");
    setDraftCategories([emptyDraftCategory()]);
    setCreateError(null);
    setView("createKit");
  }

  function backToList() {
    setSelectedGroup(null);
    setView("list");
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

  function addCustomItem(category: string) {
    const text = (newItemText[category] ?? "").trim();
    if (!text) return;
    setItems((prev) => [
      ...prev,
      {
        id: crypto.randomUUID(),
        title: text,
        category,
        urgency: "medium",
        notes: null,
        selected: true,
      },
    ]);
    setNewItemText((prev) => ({ ...prev, [category]: "" }));
  }

  async function handleConfirm() {
    if (!selectedGroup) return;
    const selectedItems = items.filter((item) => item.selected && item.title.trim());
    if (selectedItems.length === 0 || confirming) return;
    setConfirming(true);
    setError(null);
    const payload: KitItem[] = selectedItems.map((item) => ({
      title: item.title.trim(),
      category: item.category,
      urgency: item.urgency,
      notes: item.notes,
    }));
    const err = await onConfirm(selectedGroup.name, payload);
    setConfirming(false);
    if (err) {
      setError(friendlyErrorMessage(err));
      return;
    }
    onClose();
  }

  function updateCategoryName(id: string, name: string) {
    setDraftCategories((prev) => prev.map((c) => (c.id === id ? { ...c, name } : c)));
  }

  function addDraftCategory() {
    setDraftCategories((prev) => [...prev, emptyDraftCategory()]);
  }

  function removeDraftCategory(id: string) {
    setDraftCategories((prev) => (prev.length > 1 ? prev.filter((c) => c.id !== id) : prev));
  }

  function updateDraftItemTitle(categoryId: string, itemId: string, title: string) {
    setDraftCategories((prev) =>
      prev.map((c) =>
        c.id === categoryId
          ? { ...c, items: c.items.map((i) => (i.id === itemId ? { ...i, title } : i)) }
          : c
      )
    );
  }

  function addDraftItem(categoryId: string) {
    setDraftCategories((prev) =>
      prev.map((c) => (c.id === categoryId ? { ...c, items: [...c.items, emptyDraftItem()] } : c))
    );
  }

  function removeDraftItem(categoryId: string, itemId: string) {
    setDraftCategories((prev) =>
      prev.map((c) =>
        c.id === categoryId
          ? { ...c, items: c.items.length > 1 ? c.items.filter((i) => i.id !== itemId) : c.items }
          : c
      )
    );
  }

  async function handleSaveKit() {
    const trimmedName = draftName.trim();
    const rows: NewKitItem[] = draftCategories.flatMap((category) => {
      const categoryName = category.name.trim();
      if (!categoryName) return [];
      return category.items
        .map((item) => item.title.trim())
        .filter(Boolean)
        .map((title) => ({ title, category: categoryName }));
    });

    if (!trimmedName) {
      setCreateError("נא להזין שם לקיט");
      return;
    }
    if (rows.length === 0) {
      setCreateError("הוסיפו לפחות פריט אחד עם שם קטגוריה");
      return;
    }
    if (savingKit) return;

    setSavingKit(true);
    setCreateError(null);
    const err = await onCreateKit(trimmedName, rows);
    setSavingKit(false);
    if (err) {
      setCreateError(friendlyErrorMessage(err));
      return;
    }
    backToList();
  }

  const categories = Array.from(new Set(items.map((item) => item.category)));
  const selectedCount = items.filter((item) => item.selected).length;

  const title =
    view === "editItems" ? selectedGroup?.name ?? "" : view === "createKit" ? "יצירת קיט חדש" : "צור רשימה מקיט";

  return (
    <div className="fixed inset-0 z-[60] flex items-end justify-center bg-black/40 sm:items-center">
      <div className="flex max-h-[85dvh] w-full flex-col overflow-hidden rounded-t-3xl bg-white shadow-lg sm:max-w-md sm:rounded-3xl dark:bg-stone-900">
        <div className="flex shrink-0 items-center justify-between border-b border-amber-100 p-4 dark:border-amber-950/30">
          <div className="flex items-center gap-2">
            {view !== "list" && (
              <button
                type="button"
                onClick={backToList}
                aria-label="חזרה לבחירת קיט"
                className="rounded-full p-1.5 text-stone-400 hover:bg-stone-100 dark:hover:bg-stone-800"
              >
                <ArrowRight className="h-4 w-4" />
              </button>
            )}
            <h2 className="text-lg font-bold text-stone-800 dark:text-stone-100">{title}</h2>
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

        {view === "list" && (
          <div className="flex-1 overflow-y-auto p-4">
            <button
              type="button"
              onClick={openCreateKit}
              className="mb-3 flex w-full items-center justify-center gap-2 rounded-2xl border-2 border-dashed border-amber-300 px-3 py-3 text-sm font-semibold text-amber-700 transition-colors hover:bg-amber-50 dark:border-amber-800 dark:text-amber-400 dark:hover:bg-stone-800"
            >
              <Plus className="h-4 w-4" />
              צור תבנית/קיט חדש
            </button>

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
        )}

        {view === "editItems" && selectedGroup && (
          <>
            <div className="flex flex-1 flex-col gap-4 overflow-y-auto p-4">
              {error && <ErrorBanner message={error} onDismiss={() => setError(null)} />}

              {categories.map((category) => {
                const categoryItems = items.filter((item) => item.category === category);
                const allSelected = categoryItems.every((item) => item.selected);

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
                            addCustomItem(category);
                          }
                        }}
                        placeholder="הוספת פריט..."
                        className="min-w-0 flex-1 rounded-lg border border-dashed border-stone-300 bg-transparent px-2 py-1 text-xs text-stone-600 outline-none focus:border-amber-400 dark:border-stone-700 dark:text-stone-300"
                      />
                      <button
                        type="button"
                        onClick={() => addCustomItem(category)}
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

        {view === "createKit" && (
          <>
            <div className="flex flex-1 flex-col gap-4 overflow-y-auto p-4">
              {createError && <ErrorBanner message={createError} onDismiss={() => setCreateError(null)} />}

              <div>
                <p className="mb-1.5 text-xs font-medium text-stone-500 dark:text-stone-400">שם הקיט</p>
                <input
                  type="text"
                  value={draftName}
                  onChange={(event) => setDraftName(event.target.value)}
                  placeholder="לדוגמה: טיול יום, ציוד לים..."
                  className="w-full rounded-xl border border-amber-200 bg-white px-3 py-2 text-sm text-stone-700 outline-none focus:border-amber-400 dark:border-amber-900/50 dark:bg-stone-950 dark:text-stone-200"
                />
              </div>

              {draftCategories.map((category) => (
                <div
                  key={category.id}
                  className="flex flex-col gap-2 rounded-2xl border border-amber-100 p-3 dark:border-amber-950/30"
                >
                  <div className="flex items-center gap-2">
                    <input
                      type="text"
                      value={category.name}
                      onChange={(event) => updateCategoryName(category.id, event.target.value)}
                      placeholder="שם קטגוריה (למשל: אורן, ציוד כללי...)"
                      className="min-w-0 flex-1 rounded-lg border border-amber-200 bg-white px-2 py-1.5 text-sm font-medium text-stone-700 outline-none focus:border-amber-400 dark:border-amber-900/50 dark:bg-stone-950 dark:text-stone-200"
                    />
                    {draftCategories.length > 1 && (
                      <button
                        type="button"
                        onClick={() => removeDraftCategory(category.id)}
                        aria-label="מחיקת קטגוריה"
                        className="shrink-0 rounded-full p-1.5 text-stone-400 hover:bg-red-50 hover:text-red-500 dark:hover:bg-red-950/30"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    )}
                  </div>

                  <ul className="flex flex-col gap-1.5">
                    {category.items.map((item) => (
                      <li key={item.id} className="flex items-center gap-2">
                        <input
                          type="text"
                          value={item.title}
                          onChange={(event) =>
                            updateDraftItemTitle(category.id, item.id, event.target.value)
                          }
                          placeholder="שם הפריט..."
                          className="min-w-0 flex-1 rounded-lg border border-stone-200 bg-white px-2 py-1 text-sm text-stone-700 outline-none focus:border-amber-400 dark:border-stone-700 dark:bg-stone-950 dark:text-stone-200"
                        />
                        {category.items.length > 1 && (
                          <button
                            type="button"
                            onClick={() => removeDraftItem(category.id, item.id)}
                            aria-label="מחיקת פריט"
                            className="shrink-0 rounded-full p-1 text-stone-400 hover:bg-red-50 hover:text-red-500 dark:hover:bg-red-950/30"
                          >
                            <X className="h-3.5 w-3.5" />
                          </button>
                        )}
                      </li>
                    ))}
                  </ul>

                  <button
                    type="button"
                    onClick={() => addDraftItem(category.id)}
                    className="flex w-fit items-center gap-1 text-xs font-medium text-amber-600 hover:underline dark:text-amber-400"
                  >
                    <Plus className="h-3.5 w-3.5" />
                    הוספת פריט
                  </button>
                </div>
              ))}

              <button
                type="button"
                onClick={addDraftCategory}
                className="flex items-center justify-center gap-1.5 rounded-xl border border-dashed border-stone-300 px-3 py-2 text-sm font-medium text-stone-500 transition-colors hover:bg-stone-50 dark:border-stone-700 dark:text-stone-400 dark:hover:bg-stone-800"
              >
                <Plus className="h-4 w-4" />
                הוספת קטגוריה
              </button>
            </div>

            <div className="shrink-0 border-t border-amber-100 bg-white p-4 dark:border-amber-950/30 dark:bg-stone-900">
              <button
                type="button"
                onClick={handleSaveKit}
                disabled={savingKit}
                className="w-full rounded-xl bg-amber-500 px-4 py-3 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-amber-600 disabled:opacity-50"
              >
                {savingKit ? "שומר…" : "שמירת קיט"}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

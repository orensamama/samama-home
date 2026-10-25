"use client";

import { memo, useEffect, useMemo, useState, type FormEvent } from "react";
import { ChevronDown, Plus, Store, Trash2 } from "lucide-react";
import CategorySelect from "@/components/CategorySelect";
import type { BudgetCategory, MerchantCategory } from "@/lib/budgetData";

const selectClass =
  "min-w-0 max-w-[11rem] shrink-0 rounded-lg border border-stone-200 bg-white px-1.5 py-1 text-xs text-stone-700 outline-none focus:border-amber-400 dark:border-stone-700 dark:bg-stone-950 dark:text-stone-200";

function MappingRow({
  merchant,
  categories,
  onChangeCategory,
  onRename,
  onDelete,
}: {
  merchant: MerchantCategory;
  categories: BudgetCategory[];
  onChangeCategory: (id: string, categoryId: string) => void;
  onRename: (id: string, name: string) => void;
  onDelete: (id: string) => void;
}) {
  const [armed, setArmed] = useState(false);

  useEffect(() => {
    if (!armed) return;
    const timeout = setTimeout(() => setArmed(false), 3000);
    return () => clearTimeout(timeout);
  }, [armed]);

  return (
    <li className="flex items-center gap-2 rounded-xl border border-stone-200 bg-white px-2.5 py-1.5 dark:border-stone-700 dark:bg-stone-900">
      <input
        type="text"
        key={`${merchant.id}-${merchant.store_name}`}
        defaultValue={merchant.store_name}
        aria-label="שם החנות"
        onBlur={(event) => {
          const name = event.target.value.trim();
          if (name && name !== merchant.store_name) onRename(merchant.id, name);
          else event.target.value = merchant.store_name;
        }}
        onKeyDown={(event) => {
          if (event.key === "Enter") event.currentTarget.blur();
        }}
        className="min-w-0 flex-1 bg-transparent text-sm text-stone-700 outline-none dark:text-stone-200"
      />
      <CategorySelect
        categories={categories}
        value={merchant.category_id}
        onChange={(categoryId) => categoryId && onChangeCategory(merchant.id, categoryId)}
        emptyLabel="בחרו קטגוריה"
        ariaLabel={`קטגוריה עבור ${merchant.store_name}`}
        className={selectClass}
      />
      {armed ? (
        <button
          type="button"
          onClick={() => onDelete(merchant.id)}
          className="shrink-0 rounded-lg bg-red-500 px-2 py-1 text-[11px] font-medium text-white hover:bg-red-600"
        >
          מחק
        </button>
      ) : (
        <button
          type="button"
          onClick={() => setArmed(true)}
          aria-label={`מחיקת השיוך של ${merchant.store_name}`}
          className="shrink-0 rounded-full p-1.5 text-stone-400 hover:bg-red-50 hover:text-red-500 dark:hover:bg-red-950/30"
        >
          <Trash2 className="h-3.5 w-3.5" />
        </button>
      )}
    </li>
  );
}

/**
 * Admin area for the store -> category memory used by the expense form's
 * smart suggestions: add, rename, re-assign or remove any store.
 */
function StoreMappingsPanel({
  merchants,
  categories,
  onAdd,
  onChangeCategory,
  onRename,
  onDelete,
}: {
  merchants: MerchantCategory[];
  categories: BudgetCategory[];
  onAdd: (storeName: string, categoryId: string) => void;
  onChangeCategory: (id: string, categoryId: string) => void;
  onRename: (id: string, name: string) => void;
  onDelete: (id: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [newStore, setNewStore] = useState("");
  const [newCategory, setNewCategory] = useState("");
  const [search, setSearch] = useState("");

  const sorted = useMemo(() => {
    const query = search.trim().toLowerCase();
    return [...merchants]
      .filter((merchant) => !query || merchant.store_name.toLowerCase().includes(query))
      .sort((a, b) => a.store_name.localeCompare(b.store_name, "he"));
  }, [merchants, search]);

  function handleAdd(event: FormEvent) {
    event.preventDefault();
    if (!newStore.trim() || !newCategory) return;
    onAdd(newStore, newCategory);
    setNewStore("");
  }

  return (
    <section className="rounded-2xl border border-amber-100 bg-white shadow-sm dark:border-amber-950/30 dark:bg-stone-900">
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        className="flex w-full items-center gap-2 p-3 text-right"
      >
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-amber-100 text-amber-600 dark:bg-amber-950/50 dark:text-amber-400">
          <Store className="h-4 w-4" />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block text-sm font-bold text-stone-800 dark:text-stone-100">
            שיוך חנויות לקטגוריות ({merchants.length})
          </span>
          <span className="block text-xs text-stone-500 dark:text-stone-400">
            ככה המערכת יודעת שרמי לוי = סופר/מזון וש-פז = דלק
          </span>
        </span>
        <ChevronDown className={`h-4 w-4 shrink-0 text-stone-400 transition-transform ${open ? "rotate-180" : ""}`} />
      </button>

      {open && (
        <div className="flex flex-col gap-3 border-t border-amber-100 p-3 dark:border-amber-950/30">
          <form onSubmit={handleAdd} className="flex flex-col gap-1.5">
            <p className="text-xs font-medium text-stone-500 dark:text-stone-400">הוספת חנות חדשה</p>
            <div className="flex gap-1.5">
              <input
                type="text"
                value={newStore}
                onChange={(event) => setNewStore(event.target.value)}
                placeholder="שם החנות..."
                className="min-w-0 flex-1 rounded-lg border border-stone-200 bg-white px-2 py-1.5 text-sm text-stone-700 outline-none focus:border-amber-400 dark:border-stone-700 dark:bg-stone-950 dark:text-stone-200"
              />
              <CategorySelect
                categories={categories}
                value={newCategory}
                onChange={setNewCategory}
                emptyLabel="קטגוריה..."
                ariaLabel="קטגוריה לחנות החדשה"
                className={selectClass}
              />
              <button
                type="submit"
                disabled={!newStore.trim() || !newCategory}
                aria-label="הוספת חנות"
                className="shrink-0 rounded-lg bg-amber-500 px-3 text-white transition-colors hover:bg-amber-600 disabled:opacity-50"
              >
                <Plus className="h-4 w-4" />
              </button>
            </div>
          </form>

          {merchants.length > 6 && (
            <input
              type="text"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="חיפוש חנות..."
              className="w-full rounded-lg border border-stone-200 bg-white px-2 py-1.5 text-sm text-stone-700 outline-none focus:border-amber-400 dark:border-stone-700 dark:bg-stone-950 dark:text-stone-200"
            />
          )}

          {sorted.length === 0 ? (
            <p className="text-xs text-stone-400 dark:text-stone-500">
              {merchants.length === 0
                ? "עדיין אין חנויות שמורות - הן נלמדות אוטומטית עם כל הוצאה חדשה."
                : "לא נמצאו חנויות."}
            </p>
          ) : (
            <ul className="flex flex-col gap-1.5">
              {sorted.map((merchant) => (
                <MappingRow
                  key={merchant.id}
                  merchant={merchant}
                  categories={categories}
                  onChangeCategory={onChangeCategory}
                  onRename={onRename}
                  onDelete={onDelete}
                />
              ))}
            </ul>
          )}
        </div>
      )}
    </section>
  );
}

export default memo(StoreMappingsPanel);

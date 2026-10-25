"use client";

import { memo, useEffect, useState, type FormEvent } from "react";
import { Eye, EyeOff, Pencil, Plus, Trash2 } from "lucide-react";
import { formatCurrency } from "@/lib/familyData";
import {
  KIND_META,
  TONE_CLASSES,
  progressTone,
  type BudgetCategory,
  type BudgetKind,
  type CategoryStatus,
} from "@/lib/budgetData";

export type CategoryPatch = { name?: string; monthly_budget?: number; is_hidden?: boolean };

type SectionActions = {
  onAddExpense: (categoryId: string) => void;
  onUpdateCategory: (id: string, patch: CategoryPatch) => void;
  onDeleteCategory: (id: string) => void;
  onRenameGroup: (kind: BudgetKind, oldName: string, newName: string) => void;
  onDeleteGroup: (kind: BudgetKind, groupName: string) => void;
  onAddCategory: (kind: BudgetKind, groupName: string, name: string) => void;
};

/** Two-tap delete: the first tap arms it for 3 seconds, the second confirms. */
function ConfirmDeleteButton({ onConfirm, label }: { onConfirm: () => void; label: string }) {
  const [armed, setArmed] = useState(false);

  useEffect(() => {
    if (!armed) return;
    const timeout = setTimeout(() => setArmed(false), 3000);
    return () => clearTimeout(timeout);
  }, [armed]);

  return armed ? (
    <button
      type="button"
      onClick={onConfirm}
      className="shrink-0 rounded-lg bg-red-500 px-2 py-1 text-[11px] font-medium text-white hover:bg-red-600"
    >
      לחצו שוב למחיקה
    </button>
  ) : (
    <button
      type="button"
      onClick={() => setArmed(true)}
      aria-label={label}
      className="shrink-0 rounded-full p-1.5 text-stone-400 hover:bg-red-50 hover:text-red-500 dark:hover:bg-red-950/30"
    >
      <Trash2 className="h-3.5 w-3.5" />
    </button>
  );
}

function ProgressBar({ ratio, tone }: { ratio: number; tone: keyof typeof TONE_CLASSES }) {
  return (
    <div className="h-2 w-full overflow-hidden rounded-full bg-stone-100 dark:bg-stone-800">
      <div
        className={`h-full rounded-full transition-all ${TONE_CLASSES[tone].bar}`}
        style={{ width: `${Math.min(100, Math.round(ratio * 100))}%` }}
      />
    </div>
  );
}

function CategoryRow({
  status,
  manage,
  actions,
}: {
  status: CategoryStatus;
  manage: boolean;
  actions: SectionActions;
}) {
  const { category, spent, budget, ratio } = status;
  const isIncome = category.kind === "income";
  // Income is "good" when it arrives: green once the expected amount is in.
  const tone = isIncome ? (budget > 0 && spent >= budget ? "green" : spent > 0 ? "orange" : "neutral") : progressTone(spent, budget);
  const overBy = !isIncome && budget > 0 && spent > budget ? spent - budget : 0;

  if (manage) {
    return (
      <li
        className={`flex items-center gap-2 rounded-xl border border-stone-200 bg-white px-2.5 py-1.5 dark:border-stone-700 dark:bg-stone-900 ${
          category.is_hidden ? "opacity-55" : ""
        }`}
      >
        <input
          type="text"
          key={`name-${category.id}-${category.name}`}
          defaultValue={category.name}
          onBlur={(event) => {
            const name = event.target.value.trim();
            if (name && name !== category.name) actions.onUpdateCategory(category.id, { name });
            else event.target.value = category.name;
          }}
          onKeyDown={(event) => {
            if (event.key === "Enter") event.currentTarget.blur();
          }}
          className="min-w-0 flex-1 bg-transparent text-sm text-stone-700 outline-none dark:text-stone-200"
        />
        <span className="shrink-0 text-xs text-stone-400">₪</span>
        <input
          type="number"
          inputMode="decimal"
          min="0"
          key={`budget-${category.id}-${category.monthly_budget}`}
          defaultValue={Number(category.monthly_budget) || ""}
          placeholder="0"
          aria-label={`תקציב חודשי - ${category.name}`}
          onBlur={(event) => {
            const value = Number(event.target.value || 0);
            if (!Number.isNaN(value) && value >= 0 && value !== Number(category.monthly_budget)) {
              actions.onUpdateCategory(category.id, { monthly_budget: value });
            }
          }}
          onKeyDown={(event) => {
            if (event.key === "Enter") event.currentTarget.blur();
          }}
          className="w-20 shrink-0 rounded-lg border border-stone-200 bg-transparent px-2 py-1 text-sm text-stone-700 outline-none focus:border-amber-400 dark:border-stone-700 dark:text-stone-200"
        />
        <button
          type="button"
          onClick={() => actions.onUpdateCategory(category.id, { is_hidden: !category.is_hidden })}
          aria-label={category.is_hidden ? `הצגת הסעיף ${category.name}` : `הסתרת הסעיף ${category.name}`}
          title={category.is_hidden ? "מוסתר - לחצו להצגה" : "הסתרה (שומר את כל ההיסטוריה)"}
          className="shrink-0 rounded-full p-1.5 text-stone-400 hover:bg-amber-100 hover:text-amber-600 dark:hover:bg-amber-950/40 dark:hover:text-amber-400"
        >
          {category.is_hidden ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
        </button>
        <ConfirmDeleteButton
          label={`מחיקת הסעיף ${category.name}`}
          onConfirm={() => actions.onDeleteCategory(category.id)}
        />
      </li>
    );
  }

  return (
    <li className="flex flex-col gap-1.5 rounded-xl border border-amber-100 bg-white px-3 py-2 dark:border-amber-950/30 dark:bg-stone-900">
      <div className="flex items-center gap-2">
        <span className="min-w-0 flex-1 truncate text-sm font-medium text-stone-800 dark:text-stone-100">
          {category.name}
          {category.is_hidden && <span className="mr-1.5 text-[10px] font-normal text-stone-400">(מוסתר)</span>}
        </span>
        <span className={`shrink-0 text-xs font-semibold tabular-nums ${TONE_CLASSES[tone].text}`}>
          {formatCurrency(spent)}
          {budget > 0 && <span className="font-normal text-stone-400 dark:text-stone-500"> / {formatCurrency(budget)}</span>}
        </span>
        <button
          type="button"
          onClick={() => actions.onAddExpense(category.id)}
          aria-label={isIncome ? `רישום הכנסה - ${category.name}` : `הוספת הוצאה - ${category.name}`}
          className="shrink-0 rounded-full bg-amber-100 p-1 text-amber-700 transition-colors hover:bg-amber-200 dark:bg-amber-950/40 dark:text-amber-400 dark:hover:bg-amber-950/60"
        >
          <Plus className="h-3.5 w-3.5" />
        </button>
      </div>
      {(budget > 0 || spent > 0) && <ProgressBar ratio={budget > 0 ? ratio : spent > 0 ? 1 : 0} tone={tone} />}
      {overBy > 0 && (
        <p className="text-[11px] font-medium text-rose-600 dark:text-rose-400">חריגה של {formatCurrency(overBy)}</p>
      )}
      {budget <= 0 && spent > 0 && !isIncome && (
        <p className="text-[11px] text-stone-400 dark:text-stone-500">אין תקציב יעד לסעיף הזה (מצב עריכה)</p>
      )}
    </li>
  );
}

function GroupBlock({
  kind,
  groupName,
  statuses,
  manage,
  actions,
}: {
  kind: BudgetKind;
  groupName: string;
  statuses: CategoryStatus[];
  manage: boolean;
  actions: SectionActions;
}) {
  const [renaming, setRenaming] = useState(false);
  const [newName, setNewName] = useState("");

  function handleAdd(event: FormEvent) {
    event.preventDefault();
    const name = newName.trim();
    if (!name) return;
    actions.onAddCategory(kind, groupName, name);
    setNewName("");
  }

  const groupBudget = statuses.reduce((sum, status) => sum + status.budget, 0);
  const groupSpent = statuses.reduce((sum, status) => sum + status.spent, 0);

  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex items-center gap-1.5">
        {manage && renaming ? (
          <input
            type="text"
            defaultValue={groupName}
            autoFocus
            onBlur={(event) => {
              actions.onRenameGroup(kind, groupName, event.target.value);
              setRenaming(false);
            }}
            onKeyDown={(event) => {
              if (event.key === "Enter") event.currentTarget.blur();
              if (event.key === "Escape") setRenaming(false);
            }}
            className="min-w-0 flex-1 rounded-lg border border-amber-300 bg-white px-2 py-1 text-sm font-bold text-stone-700 outline-none dark:bg-stone-950 dark:text-stone-200"
          />
        ) : (
          <h4 className="min-w-0 flex-1 truncate text-sm font-bold text-stone-700 dark:text-stone-200">{groupName}</h4>
        )}
        {!manage && (groupBudget > 0 || groupSpent > 0) && (
          <span className="shrink-0 text-[11px] tabular-nums text-stone-400 dark:text-stone-500">
            {formatCurrency(groupSpent)}
            {groupBudget > 0 && ` / ${formatCurrency(groupBudget)}`}
          </span>
        )}
        {manage && !renaming && (
          <>
            <button
              type="button"
              onClick={() => setRenaming(true)}
              aria-label={`שינוי שם הקבוצה ${groupName}`}
              className="shrink-0 rounded-full p-1 text-stone-400 hover:bg-amber-100 hover:text-amber-600 dark:hover:bg-amber-950/40 dark:hover:text-amber-400"
            >
              <Pencil className="h-3.5 w-3.5" />
            </button>
            <ConfirmDeleteButton
              label={`מחיקת הקבוצה ${groupName}`}
              onConfirm={() => actions.onDeleteGroup(kind, groupName)}
            />
          </>
        )}
      </div>

      <ul className="flex flex-col gap-1.5">
        {statuses.map((status) => (
          <CategoryRow key={status.category.id} status={status} manage={manage} actions={actions} />
        ))}
      </ul>

      {manage && (
        <form onSubmit={handleAdd} className="flex gap-1.5">
          <input
            type="text"
            value={newName}
            onChange={(event) => setNewName(event.target.value)}
            placeholder={`סעיף חדש ב"${groupName}"...`}
            className="min-w-0 flex-1 rounded-lg border border-dashed border-stone-300 bg-transparent px-2 py-1.5 text-xs text-stone-600 outline-none focus:border-amber-400 dark:border-stone-700 dark:text-stone-300"
          />
          <button
            type="submit"
            disabled={!newName.trim()}
            aria-label="הוספת סעיף"
            className="shrink-0 rounded-lg border border-dashed border-stone-300 px-2 text-stone-500 hover:bg-stone-50 disabled:opacity-40 dark:border-stone-700 dark:text-stone-400 dark:hover:bg-stone-800"
          >
            <Plus className="h-3.5 w-3.5" />
          </button>
        </form>
      )}
    </div>
  );
}

function BudgetKindSection({
  kind,
  categories,
  statuses,
  manage,
  onAddExpense,
  onUpdateCategory,
  onDeleteCategory,
  onRenameGroup,
  onDeleteGroup,
  onAddCategory,
}: { kind: BudgetKind; categories: BudgetCategory[]; statuses: Map<string, CategoryStatus>; manage: boolean } & SectionActions) {
  const [newGroup, setNewGroup] = useState("");
  const [newGroupFirst, setNewGroupFirst] = useState("");
  const actions: SectionActions = {
    onAddExpense,
    onUpdateCategory,
    onDeleteCategory,
    onRenameGroup,
    onDeleteGroup,
    onAddCategory,
  };

  // Hidden categories stay out of sight unless editing -- or they still carry
  // spending this month, which must not silently vanish from the picture.
  const shown = manage
    ? categories
    : categories.filter((category) => !category.is_hidden || (statuses.get(category.id)?.spent ?? 0) > 0);
  const groups = Array.from(new Set(shown.map((category) => category.group_name)));
  const kindStatuses = shown.map((category) => statuses.get(category.id)).filter((s): s is CategoryStatus => Boolean(s));
  const totalBudget = kindStatuses.reduce((sum, status) => sum + status.budget, 0);
  const totalSpent = kindStatuses.reduce((sum, status) => sum + status.spent, 0);

  function handleAddGroup(event: FormEvent) {
    event.preventDefault();
    const group = newGroup.trim();
    const first = newGroupFirst.trim();
    if (!group || !first) return;
    onAddCategory(kind, group, first);
    setNewGroup("");
    setNewGroupFirst("");
  }

  return (
    <section className="flex flex-col gap-3 rounded-2xl border border-amber-100 bg-amber-50/40 p-3 dark:border-amber-950/30 dark:bg-stone-900/40">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <h3 className="text-base font-bold text-stone-800 dark:text-stone-100">{KIND_META[kind].label}</h3>
          <p className="text-xs text-stone-500 dark:text-stone-400">{KIND_META[kind].hint}</p>
        </div>
        <div className="shrink-0 text-left">
          <p className="text-sm font-bold tabular-nums text-stone-800 dark:text-stone-100">{formatCurrency(totalSpent)}</p>
          {totalBudget > 0 && (
            <p className="text-[11px] tabular-nums text-stone-400 dark:text-stone-500">מתוך {formatCurrency(totalBudget)}</p>
          )}
        </div>
      </div>

      {groups.length === 0 && !manage ? (
        <p className="text-xs text-stone-400 dark:text-stone-500">אין סעיפים כאן. אפשר להוסיף במצב עריכה.</p>
      ) : (
        groups.map((group) => (
          <GroupBlock
            key={group}
            kind={kind}
            groupName={group}
            statuses={shown
              .filter((category) => category.group_name === group)
              .map((category) => statuses.get(category.id))
              .filter((s): s is CategoryStatus => Boolean(s))}
            manage={manage}
            actions={actions}
          />
        ))
      )}

      {manage && (
        <form
          onSubmit={handleAddGroup}
          className="flex flex-col gap-1.5 border-t border-dashed border-stone-300 pt-3 dark:border-stone-700"
        >
          <p className="text-xs font-medium text-stone-500 dark:text-stone-400">הוספת קבוצה חדשה</p>
          <div className="flex gap-1.5">
            <input
              type="text"
              value={newGroup}
              onChange={(event) => setNewGroup(event.target.value)}
              placeholder="שם הקבוצה..."
              className="min-w-0 flex-1 rounded-lg border border-stone-200 bg-white px-2 py-1.5 text-sm text-stone-700 outline-none focus:border-amber-400 dark:border-stone-700 dark:bg-stone-950 dark:text-stone-200"
            />
            <input
              type="text"
              value={newGroupFirst}
              onChange={(event) => setNewGroupFirst(event.target.value)}
              placeholder="סעיף ראשון..."
              className="min-w-0 flex-1 rounded-lg border border-stone-200 bg-white px-2 py-1.5 text-sm text-stone-700 outline-none focus:border-amber-400 dark:border-stone-700 dark:bg-stone-950 dark:text-stone-200"
            />
            <button
              type="submit"
              disabled={!newGroup.trim() || !newGroupFirst.trim()}
              aria-label="הוספת קבוצה"
              className="shrink-0 rounded-lg bg-amber-500 px-3 text-white transition-colors hover:bg-amber-600 disabled:opacity-50"
            >
              <Plus className="h-4 w-4" />
            </button>
          </div>
        </form>
      )}
    </section>
  );
}

export default memo(BudgetKindSection);

"use client";

import { useMemo } from "react";
import { KIND_META, KIND_ORDER, type BudgetCategory } from "@/lib/budgetData";

/**
 * A native <select> of budget categories grouped by type and group name.
 * Hidden categories are left out, except the currently selected one (so an
 * existing expense/mapping that points at a hidden category still renders).
 */
export default function CategorySelect({
  categories,
  value,
  onChange,
  emptyLabel = "ללא קטגוריה",
  className = "",
  ariaLabel,
}: {
  categories: BudgetCategory[];
  value: string;
  onChange: (categoryId: string) => void;
  emptyLabel?: string;
  className?: string;
  ariaLabel?: string;
}) {
  const groupedOptions = useMemo(
    () =>
      KIND_ORDER.map((kind) => {
        const ofKind = categories.filter(
          (category) => category.kind === kind && (!category.is_hidden || category.id === value)
        );
        const groups = Array.from(new Set(ofKind.map((category) => category.group_name)));
        return {
          kind,
          groups: groups.map((group) => ({
            group,
            items: ofKind.filter((category) => category.group_name === group),
          })),
        };
      }).filter((entry) => entry.groups.length > 0),
    [categories, value]
  );

  return (
    <select
      value={value}
      onChange={(event) => onChange(event.target.value)}
      aria-label={ariaLabel}
      className={className}
    >
      <option value="">{emptyLabel}</option>
      {groupedOptions.map(({ kind, groups }) =>
        groups.map(({ group, items }) => (
          <optgroup key={`${kind}-${group}`} label={`${KIND_META[kind].label.split(" (")[0]} · ${group}`}>
            {items.map((category) => (
              <option key={category.id} value={category.id}>
                {category.name}
                {category.is_hidden ? " (מוסתר)" : ""}
              </option>
            ))}
          </optgroup>
        ))
      )}
    </select>
  );
}

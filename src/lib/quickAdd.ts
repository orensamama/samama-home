// Shared by the quick-tap modal and the /api/quick-add endpoint (iOS Shortcuts): which shops to
// offer, and which budget category a shop name points to.

import { categoryNameForText } from "@/lib/spokenExpense";
import {
  normalizeStoreKey,
  suggestMerchant,
  type BudgetCategory,
  type BudgetExpense,
  type MerchantCategory,
} from "@/lib/budgetData";

/** The shops offered before the family has history of its own, with the category each one means. */
export const DEFAULT_QUICK_VENDORS: { name: string; category: string }[] = [
  { name: "רמי לוי", category: "סופר/מזון" },
  { name: "דלק", category: "דלק" },
  { name: "פארם", category: "סופר פארם" },
  { name: "ירקות", category: "סופר/מזון" },
];

/**
 * The spending category a shop name should be filed under: the store we remember first, then the
 * built-in defaults ("פארם" -> סופר פארם), then keywords ("תחנת דלק" -> דלק). null when none fits.
 */
export function resolveQuickCategory(
  vendor: string,
  merchants: MerchantCategory[],
  categories: BudgetCategory[]
): BudgetCategory | null {
  const usable = categories.filter((category) => category.kind !== "income" && !category.is_hidden);
  const remembered = suggestMerchant(vendor, merchants);
  if (remembered) {
    const found = usable.find((category) => category.id === remembered.category_id);
    if (found) return found;
  }
  const key = normalizeStoreKey(vendor);
  const preset = DEFAULT_QUICK_VENDORS.find((entry) => normalizeStoreKey(entry.name) === key);
  const wanted = preset?.category ?? categoryNameForText(vendor);
  return wanted ? (usable.find((category) => category.name === wanted) ?? null) : null;
}

/**
 * The shops for the quick-tap grid: starred stores first, then the ones used most in the last three
 * months, then the defaults to fill the grid. Purchases in `skipCategoryIds` (income, recurring bills,
 * savings) don't count: this grid is for everyday spending. `hidden` holds the (normalized) names the
 * family removed from the grid with "ניהול חנויות".
 */
export function quickVendors(
  expenses: BudgetExpense[],
  merchants: MerchantCategory[],
  skipCategoryIds: Set<string>,
  hidden: ReadonlySet<string> = new Set(),
  limit = 8,
  today: Date = new Date()
): string[] {
  const names = new Map<string, string>(); // normalized key -> display name, in priority order
  const add = (name: string) => {
    const key = normalizeStoreKey(name);
    if (key && !hidden.has(key) && !names.has(key)) names.set(key, name.trim());
  };

  for (const merchant of merchants) if (merchant.is_favorite) add(merchant.store_name);

  const since = new Date(today.getFullYear(), today.getMonth() - 3, today.getDate()).toISOString().slice(0, 10);
  const counts = new Map<string, { name: string; count: number }>();
  for (const expense of expenses) {
    if (expense.date < since) continue;
    if (expense.category_id && skipCategoryIds.has(expense.category_id)) continue;
    const name = (expense.store ?? "").trim();
    const key = normalizeStoreKey(name);
    if (!key) continue;
    const entry = counts.get(key);
    if (entry) entry.count += 1;
    else counts.set(key, { name, count: 1 });
  }
  Array.from(counts.values())
    .sort((a, b) => b.count - a.count)
    .forEach((entry) => add(entry.name));

  for (const preset of DEFAULT_QUICK_VENDORS) add(preset.name);
  return Array.from(names.values()).slice(0, limit);
}

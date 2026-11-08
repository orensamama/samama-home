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

/** Built-in shop -> category guesses, used when a shop has no remembered category yet. */
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
 * The shops for the quick-tap grid: ONLY the ones starred as common stores (the star in "ניהול חנויות"
 * or in the store-mapping panel), the most used in the last three months first.
 */
export function quickVendors(expenses: BudgetExpense[], merchants: MerchantCategory[], today: Date = new Date()): string[] {
  const since = new Date(today.getFullYear(), today.getMonth() - 3, today.getDate()).toISOString().slice(0, 10);
  const uses = new Map<string, number>();
  for (const expense of expenses) {
    if (expense.date < since) continue;
    const key = normalizeStoreKey(expense.store ?? "");
    if (key) uses.set(key, (uses.get(key) ?? 0) + 1);
  }
  return merchants
    .filter((merchant) => merchant.is_favorite && merchant.store_name.trim())
    .sort((a, b) => (uses.get(b.store_key) ?? 0) - (uses.get(a.store_key) ?? 0) || a.store_name.localeCompare(b.store_name, "he"))
    .map((merchant) => merchant.store_name.trim());
}

import { suggestMerchant, type BudgetCategory, type MerchantCategory } from "@/lib/budgetData";
import { categoryNameForText } from "@/lib/spokenExpense";

/**
 * The category a statement line most likely belongs to: first the store we already remember
 * ("רמי לוי" -> סופר), then keywords in its name ("תחנת דלק" -> דלק). Only spending categories are
 * suggested, and never a hidden one. Returns "" when nothing fits.
 */
export function suggestExpenseCategoryId(
  merchant: string,
  merchants: MerchantCategory[],
  categories: BudgetCategory[]
): string {
  const usable = categories.filter((category) => category.kind !== "income" && !category.is_hidden);
  const remembered = suggestMerchant(merchant, merchants);
  if (remembered && usable.some((category) => category.id === remembered.category_id)) return remembered.category_id;
  const keywordName = categoryNameForText(merchant);
  if (keywordName) {
    const byKeyword = usable.find((category) => category.name === keywordName);
    if (byKeyword) return byKeyword.id;
  }
  return "";
}

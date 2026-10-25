"use client";

import { useEffect, useRef } from "react";
import { useSupabaseTable } from "@/lib/useSupabaseTable";
import { seedBudgetTemplateIfEmpty } from "@/lib/budgetActions";
import {
  CATEGORY_ORDER,
  EXPENSE_ORDER,
  EXPENSE_SELECT,
  type BudgetCategory,
  type BudgetExpense,
  type MerchantCategory,
} from "@/lib/budgetData";

/**
 * Everything the budget UI needs, from one set of query shapes -- so the
 * dashboard widget and the budget screen share cached fetches. Also does the
 * automatic first-run seeding of the family template when the database has
 * no categories yet.
 */
export function useBudgetData() {
  const categories = useSupabaseTable<BudgetCategory>("budget_categories", "*", CATEGORY_ORDER);
  const expenses = useSupabaseTable<BudgetExpense>("expenses", EXPENSE_SELECT, EXPENSE_ORDER);
  const merchants = useSupabaseTable<MerchantCategory>("merchant_categories");

  const seedChecked = useRef(false);
  const { loading, rows, refetch: refetchCategories } = categories;
  const { refetch: refetchMerchants } = merchants;

  useEffect(() => {
    // Only ever look once per mount, and only when we have no categories to show.
    if (loading || rows.length > 0 || seedChecked.current) return;
    seedChecked.current = true;
    void seedBudgetTemplateIfEmpty().then((seeded) => {
      if (seeded) {
        refetchCategories();
        refetchMerchants();
      }
    });
  }, [loading, rows.length, refetchCategories, refetchMerchants]);

  return { categories, expenses, merchants };
}

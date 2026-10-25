"use client";

import { useCallback, useEffect, useState } from "react";
import { useSupabaseTable } from "@/lib/useSupabaseTable";
import { ensureBudgetSetup, type SetupIssue, type SetupResult } from "@/lib/budgetActions";
import {
  CATEGORY_ORDER,
  EXPENSE_ORDER,
  EXPENSE_SELECT,
  type BudgetCategory,
  type BudgetExpense,
  type MerchantCategory,
} from "@/lib/budgetData";

export type BudgetSetupStatus = {
  /** A setup check is running (categories look empty/broken and we're finding out why). */
  checking: boolean;
  /** Plain-language problems with the live database; empty when everything is fine. */
  issues: SetupIssue[];
  /** Run the check again (e.g. after the user ran the fix SQL). */
  recheck: () => void;
};

/**
 * Everything the budget UI needs, from one set of query shapes -- so the
 * dashboard widget and the budget screen share cached fetches.
 *
 * Also guarantees the budget isn't silently empty: once the first real fetch
 * has finished, if there are no categories (or a table errored), it runs the
 * setup check -- which force-seeds the Excel base template into an empty table
 * and otherwise reports exactly what's wrong with the database.
 */
export function useBudgetData() {
  const categories = useSupabaseTable<BudgetCategory>("budget_categories", "*", CATEGORY_ORDER);
  const expenses = useSupabaseTable<BudgetExpense>("expenses", EXPENSE_SELECT, EXPENSE_ORDER);
  const merchants = useSupabaseTable<MerchantCategory>("merchant_categories");

  const [result, setResult] = useState<SetupResult | null>(null);
  const [nonce, setNonce] = useState(0);

  const { refetch: refetchCategories } = categories;
  const { refetch: refetchMerchants } = merchants;

  const looksBroken =
    categories.error !== null || expenses.error !== null || merchants.error !== null || categories.rows.length === 0;
  const needsCheck = categories.fetched && expenses.fetched && merchants.fetched && looksBroken;

  useEffect(() => {
    if (!needsCheck) return;
    let cancelled = false;
    void ensureBudgetSetup().then((outcome) => {
      if (cancelled) return;
      if (outcome.seeded) {
        refetchCategories();
        refetchMerchants();
      }
      setResult(outcome);
    });
    return () => {
      cancelled = true;
    };
  }, [needsCheck, nonce, refetchCategories, refetchMerchants]);

  const recheck = useCallback(() => {
    setResult(null);
    setNonce((value) => value + 1);
  }, []);

  const status: BudgetSetupStatus = {
    checking: needsCheck && result === null,
    // A stale problem report is dropped as soon as the data loads normally.
    issues: needsCheck && result ? result.issues : [],
    recheck,
  };

  return { categories, expenses, merchants, setup: status };
}

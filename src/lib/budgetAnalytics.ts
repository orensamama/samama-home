import {
  computeBudgetSummary,
  normalizeStoreKey,
  type BudgetCategory,
  type BudgetExpense,
  type BudgetOverrides,
} from "@/lib/budgetData";

export type CategoryReportRow = {
  id: string;
  name: string;
  group: string;
  spent: number;
  budget: number;
  /** spent / budget, 0 when there's no target */
  ratio: number;
  prevSpent: number;
  /** spent minus last month's spending in this category */
  delta: number;
};

export type StoreReportRow = { key: string; name: string; total: number; count: number; share: number };

export type MonthReportRow = { key: string; spent: number; income: number; saved: number };

export type MonthlyReport = {
  monthKey: string;
  totalSpent: number;
  categories: CategoryReportRow[];
  stores: StoreReportRow[];
  months: MonthReportRow[];
};

export function previousMonthKey(monthKey: string, back = 1): string {
  const [year, month] = monthKey.split("-").map(Number);
  const date = new Date(year, month - 1 - back, 1);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
}

const amountOf = (expense: BudgetExpense) => (expense.amount_pending ? 0 : Number(expense.amount) || 0);

/**
 * The month's "summary and utilisation" report: spending against target per category, the same
 * spending by shop / business, and the last few months side by side. Income is never counted as
 * spending.
 */
export function buildMonthlyReport(
  categories: BudgetCategory[],
  expenses: BudgetExpense[],
  monthKey: string,
  overrides?: BudgetOverrides,
  monthsBack = 4
): MonthlyReport {
  const summary = computeBudgetSummary(categories, expenses, monthKey, overrides);
  const prevKey = previousMonthKey(monthKey);
  const prevSummary = computeBudgetSummary(categories, expenses, prevKey, overrides);

  const categoryRows: CategoryReportRow[] = [];
  for (const category of categories) {
    if (category.kind === "income") continue;
    const status = summary.statuses.get(category.id);
    const prevSpent = prevSummary.statuses.get(category.id)?.spent ?? 0;
    const spent = status?.spent ?? 0;
    const budget = status?.budget ?? 0;
    if (spent === 0 && budget === 0 && prevSpent === 0) continue;
    categoryRows.push({
      id: category.id,
      name: category.name,
      group: category.group_name,
      spent,
      budget,
      ratio: budget > 0 ? spent / budget : 0,
      prevSpent,
      delta: spent - prevSpent,
    });
  }
  categoryRows.sort((a, b) => b.spent - a.spent || b.budget - a.budget);

  // Shops: only real spending (not income) in the viewed month.
  const incomeIds = new Set(categories.filter((category) => category.kind === "income").map((category) => category.id));
  const byStore = new Map<string, { name: string; total: number; count: number }>();
  let storeTotal = 0;
  for (const expense of expenses) {
    if (!expense.date.startsWith(monthKey)) continue;
    if (expense.category_id && incomeIds.has(expense.category_id)) continue;
    const amount = amountOf(expense);
    if (amount <= 0) continue;
    const name = (expense.store || expense.title || "ללא שם").trim();
    const key = normalizeStoreKey(name) || "unknown";
    const entry = byStore.get(key) ?? { name, total: 0, count: 0 };
    entry.total += amount;
    entry.count += 1;
    byStore.set(key, entry);
    storeTotal += amount;
  }
  const stores = Array.from(byStore, ([key, entry]) => ({ key, ...entry, share: storeTotal > 0 ? entry.total / storeTotal : 0 })).sort(
    (a, b) => b.total - a.total
  );

  const months: MonthReportRow[] = [];
  for (let back = monthsBack - 1; back >= 0; back--) {
    const key = previousMonthKey(monthKey, back);
    const monthSummary = back === 0 ? summary : computeBudgetSummary(categories, expenses, key, overrides);
    months.push({
      key,
      spent: monthSummary.totalSpent,
      income: monthSummary.income,
      saved: monthSummary.income - monthSummary.totalSpent,
    });
  }

  return { monthKey, totalSpent: summary.totalSpent, categories: categoryRows, stores, months };
}

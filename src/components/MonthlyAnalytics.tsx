"use client";

import { useMemo, useState } from "react";
import { BarChart3, ChevronDown } from "lucide-react";
import { buildMonthlyReport } from "@/lib/budgetAnalytics";
import { formatCurrency } from "@/lib/familyData";
import {
  TONE_CLASSES,
  formatMonthKey,
  progressTone,
  type BudgetCategory,
  type BudgetExpense,
  type BudgetOverrides,
} from "@/lib/budgetData";

type Tab = "categories" | "stores" | "compare";

const TABS: { value: Tab; label: string }[] = [
  { value: "categories", label: "קטגוריות" },
  { value: "stores", label: "חנויות" },
  { value: "compare", label: "השוואה" },
];

/** "סיכום ומיצוי חודשי": the month by category (against target), by shop, and against earlier months. */
export default function MonthlyAnalytics({
  categories,
  expenses,
  monthKey,
  overrides,
}: {
  categories: BudgetCategory[];
  expenses: BudgetExpense[];
  monthKey: string;
  overrides: BudgetOverrides;
}) {
  const [open, setOpen] = useState(false);
  const [tab, setTab] = useState<Tab>("categories");
  const report = useMemo(
    () => (open ? buildMonthlyReport(categories, expenses, monthKey, overrides) : null),
    [open, categories, expenses, monthKey, overrides]
  );

  const delta = (value: number) =>
    value === 0 ? (
      <span className="text-stone-400">—</span>
    ) : (
      <span className={value > 0 ? "text-rose-600 dark:text-rose-400" : "text-emerald-600 dark:text-emerald-400"}>
        {value > 0 ? "▲" : "▼"} {formatCurrency(Math.abs(value))}
      </span>
    );

  const maxMonth = report ? Math.max(1, ...report.months.map((month) => Math.max(month.spent, month.income))) : 1;

  return (
    <section className="overflow-hidden rounded-2xl border border-amber-100 bg-white shadow-sm dark:border-amber-950/30 dark:bg-stone-900">
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        aria-expanded={open}
        className="flex w-full items-center gap-2 px-4 py-3 text-right"
      >
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-amber-100 text-amber-600 dark:bg-amber-950/50 dark:text-amber-400">
          <BarChart3 className="h-4 w-4" />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block text-sm font-bold text-stone-800 dark:text-stone-100">סיכום ומיצוי חודשי</span>
          <span className="block text-xs text-stone-500 dark:text-stone-400">לפי קטגוריות, חנויות והשוואה לחודשים קודמים</span>
        </span>
        <ChevronDown className={`h-4 w-4 shrink-0 text-stone-400 transition-transform ${open ? "rotate-180" : ""}`} />
      </button>

      {open && report && (
        <div className="flex flex-col gap-3 border-t border-stone-100 px-3 pb-4 pt-3 dark:border-stone-800">
          <div className="grid grid-cols-3 gap-1 rounded-xl bg-stone-100 p-1 dark:bg-stone-800" role="tablist">
            {TABS.map((entry) => (
              <button
                key={entry.value}
                type="button"
                role="tab"
                aria-selected={tab === entry.value}
                onClick={() => setTab(entry.value)}
                className={`rounded-lg py-2 text-xs font-semibold transition-colors ${
                  tab === entry.value ? "bg-white text-amber-700 shadow-sm dark:bg-stone-900 dark:text-amber-400" : "text-stone-500 dark:text-stone-400"
                }`}
              >
                {entry.label}
              </button>
            ))}
          </div>

          <p className="px-1 text-xs text-stone-500 dark:text-stone-400">
            {formatMonthKey(monthKey)}: הוצאנו <strong className="text-stone-800 dark:text-stone-100">{formatCurrency(report.totalSpent)}</strong>
          </p>

          {tab === "categories" && (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[20rem] text-right text-xs">
                <thead className="text-[11px] text-stone-400 dark:text-stone-500">
                  <tr>
                    <th className="px-1 py-1.5 font-medium">קטגוריה</th>
                    <th className="px-1 py-1.5 font-medium">הוצאנו</th>
                    <th className="px-1 py-1.5 font-medium">יעד</th>
                    <th className="px-1 py-1.5 font-medium">מיצוי</th>
                    <th className="px-1 py-1.5 font-medium">מול חודש קודם</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-stone-100 dark:divide-stone-800">
                  {report.categories.length === 0 && (
                    <tr>
                      <td colSpan={5} className="px-1 py-4 text-center text-stone-400">אין עדיין הוצאות החודש</td>
                    </tr>
                  )}
                  {report.categories.map((row) => {
                    const tone = progressTone(row.spent, row.budget);
                    return (
                      <tr key={row.id}>
                        <td className="px-1 py-2 text-stone-800 dark:text-stone-100">{row.name}</td>
                        <td className="px-1 py-2 font-semibold tabular-nums">{formatCurrency(row.spent)}</td>
                        <td className="px-1 py-2 tabular-nums text-stone-500">{row.budget > 0 ? formatCurrency(row.budget) : "—"}</td>
                        <td className="px-1 py-2">
                          {row.budget > 0 ? (
                            <span className="flex min-w-[4.5rem] items-center gap-1.5">
                              <span className="block h-1.5 flex-1 overflow-hidden rounded-full bg-stone-100 dark:bg-stone-800">
                                <span className={`block h-full rounded-full ${TONE_CLASSES[tone].bar}`} style={{ width: `${Math.min(100, Math.round(row.ratio * 100))}%` }} />
                              </span>
                              <span className={`tabular-nums ${TONE_CLASSES[tone].text}`}>{Math.round(row.ratio * 100)}%</span>
                            </span>
                          ) : (
                            <span className="text-stone-300">—</span>
                          )}
                        </td>
                        <td className="px-1 py-2 tabular-nums">{delta(row.delta)}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}

          {tab === "stores" && (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[18rem] text-right text-xs">
                <thead className="text-[11px] text-stone-400 dark:text-stone-500">
                  <tr>
                    <th className="px-1 py-1.5 font-medium">חנות / בית עסק</th>
                    <th className="px-1 py-1.5 font-medium">סה״כ</th>
                    <th className="px-1 py-1.5 font-medium">קניות</th>
                    <th className="px-1 py-1.5 font-medium">חלק</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-stone-100 dark:divide-stone-800">
                  {report.stores.length === 0 && (
                    <tr>
                      <td colSpan={4} className="px-1 py-4 text-center text-stone-400">אין עדיין הוצאות החודש</td>
                    </tr>
                  )}
                  {report.stores.slice(0, 15).map((row) => (
                    <tr key={row.key}>
                      <td className="px-1 py-2 text-stone-800 dark:text-stone-100">{row.name}</td>
                      <td className="px-1 py-2 font-semibold tabular-nums">{formatCurrency(row.total)}</td>
                      <td className="px-1 py-2 tabular-nums text-stone-500">{row.count}</td>
                      <td className="px-1 py-2">
                        <span className="flex min-w-[4.5rem] items-center gap-1.5">
                          <span className="block h-1.5 flex-1 overflow-hidden rounded-full bg-stone-100 dark:bg-stone-800">
                            <span className="block h-full rounded-full bg-amber-400" style={{ width: `${Math.round(row.share * 100)}%` }} />
                          </span>
                          <span className="tabular-nums text-stone-500">{Math.round(row.share * 100)}%</span>
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {report.stores.length > 15 && <p className="px-1 pt-1 text-[11px] text-stone-400">מוצגות 15 החנויות הגדולות מתוך {report.stores.length}</p>}
            </div>
          )}

          {tab === "compare" && (
            <div className="flex flex-col gap-2.5">
              {report.months.map((month, index) => {
                const previous = index > 0 ? report.months[index - 1] : null;
                return (
                  <div key={month.key} className="flex flex-col gap-1">
                    <div className="flex items-baseline justify-between text-xs">
                      <span className={`font-semibold ${month.key === monthKey ? "text-amber-700 dark:text-amber-400" : "text-stone-700 dark:text-stone-200"}`}>
                        {formatMonthKey(month.key)}
                      </span>
                      <span className="tabular-nums text-stone-500">
                        הוצאות {formatCurrency(month.spent)}
                        {previous && previous.spent > 0 && <span className="ms-2">{delta(month.spent - previous.spent)}</span>}
                      </span>
                    </div>
                    <span className="block h-2 overflow-hidden rounded-full bg-stone-100 dark:bg-stone-800">
                      <span className="block h-full rounded-full bg-amber-400" style={{ width: `${Math.round((month.spent / maxMonth) * 100)}%` }} />
                    </span>
                    <span className="block h-1.5 overflow-hidden rounded-full bg-stone-100 dark:bg-stone-800">
                      <span className="block h-full rounded-full bg-emerald-400" style={{ width: `${Math.round((month.income / maxMonth) * 100)}%` }} />
                    </span>
                    <p className="text-[11px] tabular-nums text-stone-400">
                      הכנסות {formatCurrency(month.income)} · {month.saved >= 0 ? "נשאר" : "חסר"} {formatCurrency(Math.abs(month.saved))}
                    </p>
                  </div>
                );
              })}
              <p className="text-[11px] text-stone-400">פס כתום = הוצאות, פס ירוק = הכנסות</p>
            </div>
          )}
        </div>
      )}
    </section>
  );
}

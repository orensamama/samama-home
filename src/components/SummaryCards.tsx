"use client";

import Link from "next/link";
import { ListChecks, ShoppingCart } from "lucide-react";
import { useSupabaseTable } from "@/lib/useSupabaseTable";
import { SkeletonGrid } from "@/components/Skeleton";
import { isDueToday, type Task } from "@/lib/taskData";
import type { ShoppingItem } from "@/lib/shoppingData";

export default function SummaryCards() {
  const { rows: tasks, loading: tasksLoading } = useSupabaseTable<Task>("tasks");
  // Same table+select+orderBy as ShoppingArsenal/LiveShoppingList, so all
  // three share one cached fetch instead of each re-querying "shopping" on
  // its own when the user switches tabs.
  const { rows: shopping, loading: shoppingLoading } = useSupabaseTable<ShoppingItem>("shopping", "*", {
    column: "created_at",
    ascending: true,
  });

  if ((tasksLoading && tasks.length === 0) || (shoppingLoading && shopping.length === 0)) {
    return <SkeletonGrid />;
  }

  const cards = [
    {
      href: "/tasks",
      label: "משימות בדחיפות גבוהה",
      value: tasks.filter(
        (task) =>
          !task.is_template &&
          !task.archived &&
          task.status !== "done" &&
          (task.urgency === "high" || (task.due_date && isDueToday(task.due_date)))
      ).length,
      icon: ListChecks,
      color: "text-orange-600 dark:text-orange-400",
      bg: "bg-orange-50 dark:bg-orange-950/40",
    },
    {
      href: "/shopping?view=live",
      label: "רשימת הקניות שלי",
      value: shopping.filter((item) => item.in_cart && !item.completed).length,
      icon: ShoppingCart,
      color: "text-amber-600 dark:text-amber-400",
      bg: "bg-amber-50 dark:bg-amber-950/40",
    },
  ];

  return (
    <div className="grid grid-cols-2 gap-3">
      {cards.map(({ href, label, value, icon: Icon, color, bg }) => (
        <Link
          key={href}
          href={href}
          className="flex flex-col gap-2 rounded-2xl border border-amber-100 bg-white p-4 shadow-sm transition-shadow hover:shadow-md dark:border-amber-950/30 dark:bg-stone-900"
        >
          <span className={`inline-flex w-fit rounded-full p-2.5 ${bg}`}>
            <Icon className={`h-5 w-5 ${color}`} />
          </span>
          <div>
            <p className="text-sm text-stone-500 dark:text-stone-400">{label}</p>
            <p className="mt-0.5 text-xl font-bold text-stone-800 dark:text-stone-100">{value}</p>
          </div>
        </Link>
      ))}
    </div>
  );
}

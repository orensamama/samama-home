"use client";

import Link from "next/link";
import { ListChecks, ShoppingCart } from "lucide-react";
import { useLocalStorage } from "@/lib/useLocalStorage";
import { DEFAULT_SHOPPING, DEFAULT_TASKS, type ShoppingItem, type TaskItem } from "@/lib/familyData";

export default function SummaryCards() {
  const [tasks] = useLocalStorage<TaskItem[]>("samama-tasks", DEFAULT_TASKS);
  const [shopping] = useLocalStorage<ShoppingItem[]>("samama-shopping", DEFAULT_SHOPPING);

  const cards = [
    {
      href: "/tasks",
      label: "משימות להיום",
      value: tasks.filter((task) => !task.done).length,
      icon: ListChecks,
      color: "text-orange-600 dark:text-orange-400",
      bg: "bg-orange-50 dark:bg-orange-950/40",
    },
    {
      href: "/shopping",
      label: "קניות דחופות",
      value: shopping.filter((item) => !item.done).length,
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

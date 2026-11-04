"use client";

import Link from "next/link";
import { BookOpen, ShoppingCart } from "lucide-react";
import { useSupabaseTable } from "@/lib/useSupabaseTable";
import { useRecipes } from "@/lib/useRecipes";
import { SkeletonGrid } from "@/components/Skeleton";
import { collectTags } from "@/lib/recipeData";
import type { ShoppingItem } from "@/lib/shoppingData";

export default function SummaryCards() {
  const { recipes, tags, loading: recipesLoading } = useRecipes();
  // Same table+select+orderBy as ShoppingArsenal/LiveShoppingList, so all
  // three share one cached fetch instead of each re-querying "shopping" on
  // its own when the user switches tabs.
  const { rows: shopping, loading: shoppingLoading } = useSupabaseTable<ShoppingItem>("shopping", "*", {
    column: "created_at",
    ascending: true,
  });

  if ((recipesLoading && recipes.length === 0) || (shoppingLoading && shopping.length === 0)) {
    return <SkeletonGrid />;
  }

  const categoryCount = collectTags(tags, recipes).length;
  const cards = [
    {
      href: "/recipes",
      label: "ספר המתכונים המשפחתי",
      value: recipes.length,
      sub: recipes.length === 0 ? "מתחילים לאסוף" : categoryCount > 0 ? `מתכונים · ${categoryCount} קטגוריות` : "מתכונים",
      icon: BookOpen,
      color: "text-orange-600 dark:text-orange-400",
      bg: "bg-orange-50 dark:bg-orange-950/40",
    },
    {
      href: "/shopping?view=live",
      label: "רשימת הקניות שלי",
      value: shopping.filter((item) => item.in_cart && !item.completed).length,
      sub: null,
      icon: ShoppingCart,
      color: "text-amber-600 dark:text-amber-400",
      bg: "bg-amber-50 dark:bg-amber-950/40",
    },
  ];

  return (
    <div className="grid grid-cols-2 gap-3">
      {cards.map(({ href, label, value, sub, icon: Icon, color, bg }) => (
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
            <p className="mt-0.5 text-xl font-bold text-stone-800 dark:text-stone-100">
              {value}
              {sub && <span className="ms-1.5 text-xs font-medium text-stone-400 dark:text-stone-500">{sub}</span>}
            </p>
          </div>
        </Link>
      ))}
    </div>
  );
}

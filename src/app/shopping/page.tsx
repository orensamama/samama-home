"use client";

import { useState } from "react";
import PageHeader from "@/components/PageHeader";
import ShoppingArsenal from "@/components/ShoppingArsenal";
import LiveShoppingList from "@/components/LiveShoppingList";

type View = "prep" | "live";

const VIEWS: { value: View; label: string }[] = [
  { value: "prep", label: "הכנת רשימה וארסנל מוצרים" },
  { value: "live", label: "🛒 אני בסופר!" },
];

function getInitialView(): View {
  if (typeof window === "undefined") return "prep";
  return new URLSearchParams(window.location.search).get("view") === "live" ? "live" : "prep";
}

export default function ShoppingPage() {
  const [view, setView] = useState<View>(getInitialView);

  return (
    <div className="flex min-h-full flex-col">
      <PageHeader title="קניות" subtitle="רשימת הקניות של המשפחה" />

      <div className="flex flex-col gap-4 p-4">
        <div className="grid grid-cols-2 gap-1.5 rounded-2xl bg-amber-50 p-1 dark:bg-stone-900">
          {VIEWS.map((option) => (
            <button
              key={option.value}
              type="button"
              onClick={() => setView(option.value)}
              className={`rounded-xl px-2 py-2 text-sm font-medium transition-colors ${
                view === option.value
                  ? "bg-white text-amber-700 shadow-sm dark:bg-stone-800 dark:text-amber-400"
                  : "text-stone-500 dark:text-stone-400"
              }`}
            >
              {option.label}
            </button>
          ))}
        </div>

        {view === "prep" ? <ShoppingArsenal /> : <LiveShoppingList />}
      </div>
    </div>
  );
}

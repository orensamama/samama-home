"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { ListChecks, ShoppingCart, ChefHat, Wallet } from "lucide-react";

// The dashboard is not a tab any more: the home button / logo in every screen's header goes there.
const NAV_ITEMS = [
  { href: "/tasks", label: "משימות", icon: ListChecks },
  { href: "/shopping", label: "קניות", icon: ShoppingCart },
  { href: "/recipes", label: "מתכונים", icon: ChefHat },
  { href: "/budget", label: "פיננסממה", icon: Wallet },
];

export default function BottomNav() {
  const pathname = usePathname();

  return (
    <nav
      // pb-safe: keeps the buttons clear of the iPhone home indicator.
      className="fixed inset-x-0 bottom-0 z-50 border-t border-amber-100 bg-white/95 pb-[env(safe-area-inset-bottom)] backdrop-blur dark:border-amber-950/40 dark:bg-stone-950/95"
      aria-label="ניווט ראשי"
    >
      <ul className="mx-auto grid max-w-2xl grid-cols-4 px-2 pt-1.5">
        {NAV_ITEMS.map(({ href, label, icon: Icon }) => {
          const isActive = pathname.startsWith(href);
          return (
            <li key={href}>
              <Link
                href={href}
                // min-h-[56px]: a comfortable touch target (48px or more) for every tab.
                className={`mx-1 flex min-h-[56px] flex-col items-center justify-center gap-1 rounded-2xl px-2 py-2 text-xs font-medium transition-colors active:bg-amber-50 dark:active:bg-stone-900 ${
                  isActive
                    ? "bg-amber-50 text-amber-600 dark:bg-amber-950/30 dark:text-amber-400"
                    : "text-stone-500 dark:text-stone-400"
                }`}
                aria-current={isActive ? "page" : undefined}
              >
                <Icon className="h-7 w-7" strokeWidth={isActive ? 2.5 : 2} />
                <span className="text-[13px] font-semibold leading-none">{label}</span>
              </Link>
            </li>
          );
        })}
      </ul>
      {/* a little breathing room under the labels on devices without a home indicator */}
      <div className="h-1.5" />
    </nav>
  );
}

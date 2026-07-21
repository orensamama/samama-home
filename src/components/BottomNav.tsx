"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  LayoutDashboard,
  ListChecks,
  ShoppingCart,
  CalendarDays,
  Wallet,
} from "lucide-react";

const NAV_ITEMS = [
  { href: "/", label: "דשבורד", icon: LayoutDashboard },
  { href: "/tasks", label: "משימות", icon: ListChecks },
  { href: "/shopping", label: "קניות", icon: ShoppingCart },
  { href: "/events", label: "אירועים", icon: CalendarDays },
  { href: "/expenses", label: "הוצאות", icon: Wallet },
];

export default function BottomNav() {
  const pathname = usePathname();

  return (
    <nav
      className="fixed inset-x-0 bottom-0 z-50 border-t border-amber-100 bg-white/95 pb-[env(safe-area-inset-bottom)] backdrop-blur dark:border-amber-950/40 dark:bg-stone-950/95"
      aria-label="ניווט ראשי"
    >
      <ul className="grid grid-cols-5">
        {NAV_ITEMS.map(({ href, label, icon: Icon }) => {
          const isActive = href === "/" ? pathname === "/" : pathname.startsWith(href);
          return (
            <li key={href}>
              <Link
                href={href}
                className={`flex flex-col items-center gap-1 py-2 text-[11px] transition-colors ${
                  isActive
                    ? "text-amber-600 dark:text-amber-400"
                    : "text-stone-500 dark:text-stone-400"
                }`}
                aria-current={isActive ? "page" : undefined}
              >
                <Icon className="h-6 w-6" strokeWidth={isActive ? 2.5 : 2} />
                <span className="leading-none">{label}</span>
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}

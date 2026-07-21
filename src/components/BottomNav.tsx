"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { LayoutDashboard, ListChecks, ShoppingCart, CalendarClock } from "lucide-react";

const NAV_ITEMS = [
  { href: "/", label: "דשבורד", icon: LayoutDashboard },
  { href: "/tasks", label: "משימות", icon: ListChecks },
  { href: "/shopping", label: "קניות", icon: ShoppingCart },
  { href: "/events", label: "תאריכים והוצאות", icon: CalendarClock },
];

export default function BottomNav() {
  const pathname = usePathname();

  return (
    <nav
      className="fixed inset-x-0 bottom-0 z-50 border-t border-zinc-200 bg-white/95 pb-[env(safe-area-inset-bottom)] backdrop-blur dark:border-zinc-800 dark:bg-zinc-950/95"
      aria-label="ניווט ראשי"
    >
      <ul className="grid grid-cols-4">
        {NAV_ITEMS.map(({ href, label, icon: Icon }) => {
          const isActive = href === "/" ? pathname === "/" : pathname.startsWith(href);
          return (
            <li key={href}>
              <Link
                href={href}
                className={`flex flex-col items-center gap-1 py-2 text-xs transition-colors ${
                  isActive
                    ? "text-teal-600 dark:text-teal-400"
                    : "text-zinc-500 dark:text-zinc-400"
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

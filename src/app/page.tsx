import Link from "next/link";
import { ListChecks, ShoppingCart, CalendarClock } from "lucide-react";
import PageHeader from "@/components/PageHeader";

const SUMMARY_CARDS = [
  {
    href: "/tasks",
    label: "משימות פתוחות",
    value: "0",
    icon: ListChecks,
    color: "text-blue-600 dark:text-blue-400",
    bg: "bg-blue-50 dark:bg-blue-950/40",
  },
  {
    href: "/shopping",
    label: "פריטים לקנייה",
    value: "0",
    icon: ShoppingCart,
    color: "text-amber-600 dark:text-amber-400",
    bg: "bg-amber-50 dark:bg-amber-950/40",
  },
  {
    href: "/events",
    label: "אירועים קרובים",
    value: "0",
    icon: CalendarClock,
    color: "text-teal-600 dark:text-teal-400",
    bg: "bg-teal-50 dark:bg-teal-950/40",
  },
];

export default function DashboardPage() {
  return (
    <div className="flex min-h-full flex-col">
      <PageHeader title="דשבורד" subtitle="ברוכים הבאים למערכת הבית של משפחת סממה" />

      <div className="flex flex-col gap-4 p-4">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          {SUMMARY_CARDS.map(({ href, label, value, icon: Icon, color, bg }) => (
            <Link
              key={href}
              href={href}
              className="flex items-center justify-between rounded-2xl border border-zinc-200 bg-white p-4 shadow-sm transition-shadow hover:shadow-md dark:border-zinc-800 dark:bg-zinc-900"
            >
              <div>
                <p className="text-sm text-zinc-500 dark:text-zinc-400">{label}</p>
                <p className="mt-1 text-2xl font-bold">{value}</p>
              </div>
              <span className={`rounded-full p-3 ${bg}`}>
                <Icon className={`h-6 w-6 ${color}`} />
              </span>
            </Link>
          ))}
        </div>

        <div className="rounded-2xl border border-dashed border-zinc-300 p-6 text-center text-sm text-zinc-500 dark:border-zinc-700 dark:text-zinc-400">
          עוד תוכן יתווסף כאן בהמשך - זהו מסך התחלתי.
        </div>
      </div>
    </div>
  );
}

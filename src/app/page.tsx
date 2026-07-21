import Image from "next/image";
import Link from "next/link";
import { ListChecks, ShoppingCart } from "lucide-react";
import FamilyQuote from "@/components/FamilyQuote";

const SUMMARY_CARDS = [
  {
    href: "/tasks",
    label: "משימות להיום",
    value: "0",
    icon: ListChecks,
    color: "text-blue-600 dark:text-blue-400",
    bg: "bg-blue-50 dark:bg-blue-950/40",
  },
  {
    href: "/shopping",
    label: "קניות דחופות",
    value: "0",
    icon: ShoppingCart,
    color: "text-amber-600 dark:text-amber-400",
    bg: "bg-amber-50 dark:bg-amber-950/40",
  },
];

function getHebrewDate() {
  return new Intl.DateTimeFormat("he-IL", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
  }).format(new Date());
}

export default function DashboardPage() {
  const today = getHebrewDate();

  return (
    <div className="flex min-h-full flex-col">
      <header className="flex flex-col items-center gap-3 bg-gradient-to-b from-teal-50 to-transparent px-4 pb-6 pt-8 text-center dark:from-teal-950/30">
        <div className="relative h-24 w-24 overflow-hidden rounded-full border-4 border-white shadow-md ring-1 ring-zinc-200 dark:border-zinc-900 dark:ring-zinc-700">
          <Image
            src="/family.jpg"
            alt="משפחת סממה"
            fill
            priority
            sizes="96px"
            className="object-cover"
          />
        </div>

        <div>
          <h1 className="text-2xl font-bold">שלום אורן ואורית!</h1>
          <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">{today}</p>
        </div>

        <FamilyQuote />
      </header>

      <div className="flex flex-col gap-4 p-4">
        <div className="grid grid-cols-2 gap-3">
          {SUMMARY_CARDS.map(({ href, label, value, icon: Icon, color, bg }) => (
            <Link
              key={href}
              href={href}
              className="flex flex-col gap-2 rounded-2xl border border-zinc-200 bg-white p-4 shadow-sm transition-shadow hover:shadow-md dark:border-zinc-800 dark:bg-zinc-900"
            >
              <span className={`inline-flex w-fit rounded-full p-2.5 ${bg}`}>
                <Icon className={`h-5 w-5 ${color}`} />
              </span>
              <div>
                <p className="text-sm text-zinc-500 dark:text-zinc-400">{label}</p>
                <p className="mt-0.5 text-xl font-bold">{value}</p>
              </div>
            </Link>
          ))}
        </div>
      </div>
    </div>
  );
}

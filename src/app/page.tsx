import Image from "next/image";
import FamilyQuote from "@/components/FamilyQuote";
import SummaryCards from "@/components/SummaryCards";
import UpcomingEvents from "@/components/UpcomingEvents";

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
    <div className="flex min-h-full flex-col bg-gradient-to-b from-amber-50/70 to-transparent dark:from-amber-950/10">
      <header className="flex flex-col items-center gap-4 px-4 pb-6 pt-8 text-center">
        <div className="-rotate-2 rounded-2xl border-[6px] border-white bg-white p-1 shadow-lg ring-1 ring-amber-100 dark:border-stone-800 dark:bg-stone-800 dark:ring-amber-950/40">
          <div className="relative h-40 w-40 overflow-hidden rounded-xl sm:h-48 sm:w-48">
            <Image
              src="/family.jpg"
              alt="משפחת סממה"
              fill
              priority
              sizes="(min-width: 640px) 192px, 160px"
              className="object-cover"
            />
          </div>
        </div>

        <div>
          <h1 className="text-2xl font-bold text-stone-800 dark:text-stone-50">
            שלום אורן ואורית! <span aria-hidden="true">❤️</span>
          </h1>
          <p className="mt-1 text-sm text-stone-500 dark:text-stone-400">{today}</p>
        </div>

        <FamilyQuote />
      </header>

      <div className="flex flex-col gap-6 p-4">
        <SummaryCards />
        <UpcomingEvents />
      </div>
    </div>
  );
}

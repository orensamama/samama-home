import FamilyPhoto from "@/components/FamilyPhoto";
import FamilyQuote from "@/components/FamilyQuote";
import BudgetWidget from "@/components/BudgetWidget";
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
        <FamilyPhoto />

        <div>
          <h1 className="text-2xl font-bold text-stone-800 dark:text-stone-50">
            שלום אורן ואורית! <span aria-hidden="true">❤️</span>
          </h1>
          <p className="mt-1 text-sm text-stone-500 dark:text-stone-400">{today}</p>
        </div>

        <FamilyQuote />
      </header>

      <div className="flex flex-col gap-6 p-4">
        <BudgetWidget />
        <SummaryCards />
        <UpcomingEvents />
      </div>
    </div>
  );
}

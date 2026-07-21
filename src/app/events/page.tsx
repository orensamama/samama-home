"use client";

import { CalendarDays } from "lucide-react";
import PageHeader from "@/components/PageHeader";
import { useLocalStorage } from "@/lib/useLocalStorage";
import { DEFAULT_EVENTS, formatEventDate, type FamilyEvent } from "@/lib/familyData";

export default function EventsPage() {
  const [events] = useLocalStorage<FamilyEvent[]>("samama-events", DEFAULT_EVENTS);
  const sorted = [...events].sort((a, b) => a.date.localeCompare(b.date));

  return (
    <div className="flex min-h-full flex-col">
      <PageHeader title="תאריכים ואירועים" subtitle="האירועים הקרובים של המשפחה" />

      <div className="flex flex-col gap-3 p-4">
        {sorted.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-amber-200 p-8 text-center text-sm text-stone-500 dark:border-amber-900/40 dark:text-stone-400">
            אין עדיין אירועים. בקרוב ניתן יהיה להוסיף אירועים חדשים כאן.
          </div>
        ) : (
          <ul className="flex flex-col gap-2">
            {sorted.map((event) => (
              <li
                key={event.id}
                className="flex items-center gap-3 rounded-2xl border border-amber-100 bg-white p-3 shadow-sm dark:border-amber-950/30 dark:bg-stone-900"
              >
                <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-amber-100 text-amber-600 dark:bg-amber-950/50 dark:text-amber-400">
                  <CalendarDays className="h-5 w-5" />
                </span>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium text-stone-800 dark:text-stone-100">
                    {event.title}
                  </p>
                  <p className="text-xs text-stone-500 dark:text-stone-400">
                    {formatEventDate(event.date)}
                  </p>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

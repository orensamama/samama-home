"use client";

import Link from "next/link";
import { CalendarDays } from "lucide-react";
import { useSupabaseTable } from "@/lib/useSupabaseTable";
import { formatDate, type FamilyEvent } from "@/lib/familyData";

export default function UpcomingEvents() {
  const { rows: events } = useSupabaseTable<FamilyEvent>("events", "id, title, date:event_date", {
    column: "event_date",
    ascending: true,
  });
  const upcoming = events.slice(0, 3);

  return (
    <section className="flex flex-col gap-3">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-bold text-stone-800 dark:text-stone-100">
          תאריכים ואירועים קרובים
        </h2>
        <Link
          href="/events"
          className="text-xs font-medium text-amber-600 hover:underline dark:text-amber-400"
        >
          לכל האירועים
        </Link>
      </div>

      {upcoming.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-amber-200 p-6 text-center text-sm text-stone-500 dark:border-amber-900/40 dark:text-stone-400">
          אין אירועים קרובים כרגע.
        </div>
      ) : (
        <ul className="flex flex-col gap-2">
          {upcoming.map((event) => (
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
                  {formatDate(event.date)}
                </p>
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

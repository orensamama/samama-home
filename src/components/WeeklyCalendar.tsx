"use client";

import { useState } from "react";
import { ChevronLeft, ChevronRight, MapPin } from "lucide-react";
import { HEBREW_WEEKDAY_NAMES, getWeekDates, toISODate, type FamilyEvent } from "@/lib/familyData";

const RANGE_FORMATTER = new Intl.DateTimeFormat("he-IL", { day: "numeric", month: "short" });

export default function WeeklyCalendar({ events }: { events: FamilyEvent[] }) {
  const [weekOffset, setWeekOffset] = useState(0);
  const weekDates = getWeekDates(weekOffset);
  const todayIso = toISODate(new Date());
  const rangeLabel = `${RANGE_FORMATTER.format(weekDates[0])} – ${RANGE_FORMATTER.format(weekDates[6])}`;

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center justify-between rounded-2xl border border-amber-100 bg-white p-2 shadow-sm dark:border-amber-950/30 dark:bg-stone-900">
        <button
          type="button"
          onClick={() => setWeekOffset((week) => week - 1)}
          aria-label="שבוע קודם"
          className="rounded-full p-2 text-stone-500 transition-colors hover:bg-amber-50 dark:text-stone-400 dark:hover:bg-stone-800"
        >
          <ChevronRight className="h-4 w-4" />
        </button>
        <div className="flex flex-col items-center">
          <span className="text-sm font-semibold text-stone-800 dark:text-stone-100">{rangeLabel}</span>
          {weekOffset !== 0 && (
            <button
              type="button"
              onClick={() => setWeekOffset(0)}
              className="text-xs text-amber-600 hover:underline dark:text-amber-400"
            >
              השבוע הנוכחי
            </button>
          )}
        </div>
        <button
          type="button"
          onClick={() => setWeekOffset((week) => week + 1)}
          aria-label="שבוע הבא"
          className="rounded-full p-2 text-stone-500 transition-colors hover:bg-amber-50 dark:text-stone-400 dark:hover:bg-stone-800"
        >
          <ChevronLeft className="h-4 w-4" />
        </button>
      </div>

      <div className="flex flex-col gap-2">
        {weekDates.map((date) => {
          const iso = toISODate(date);
          const isToday = iso === todayIso;
          const dayEvents = events.filter((event) => event.date === iso);

          return (
            <div
              key={iso}
              className={`rounded-2xl border p-3 shadow-sm ${
                isToday
                  ? "border-amber-300 bg-amber-50 dark:border-amber-700 dark:bg-amber-950/20"
                  : "border-amber-100 bg-white dark:border-amber-950/30 dark:bg-stone-900"
              }`}
            >
              <div className="mb-1.5 flex items-baseline justify-between">
                <span className="text-sm font-bold text-stone-800 dark:text-stone-100">
                  {HEBREW_WEEKDAY_NAMES[date.getDay()]}
                </span>
                <span className="text-xs text-stone-500 dark:text-stone-400">
                  {RANGE_FORMATTER.format(date)}
                </span>
              </div>
              {dayEvents.length === 0 ? (
                <p className="text-xs text-stone-400 dark:text-stone-500">אין אירועים</p>
              ) : (
                <ul className="flex flex-col gap-1.5">
                  {dayEvents.map((event) => (
                    <li
                      key={event.id}
                      className="rounded-lg bg-amber-50/70 px-2 py-1.5 text-sm text-stone-700 dark:bg-stone-950/40 dark:text-stone-200"
                    >
                      <p className="font-medium">{event.title}</p>
                      {event.location && (
                        <p className="flex items-center gap-1 text-xs text-stone-500 dark:text-stone-400">
                          <MapPin className="h-3 w-3 shrink-0" />
                          {event.location}
                        </p>
                      )}
                    </li>
                  ))}
                </ul>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

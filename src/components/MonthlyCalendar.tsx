"use client";

import { useState } from "react";
import { ChevronLeft, ChevronRight, MapPin } from "lucide-react";
import { formatTime, HEBREW_WEEKDAY_NAMES, toISODate, type FamilyEvent } from "@/lib/familyData";

const MONTH_FORMATTER = new Intl.DateTimeFormat("he-IL", { month: "long", year: "numeric" });
const WEEKDAY_SHORT = ["א", "ב", "ג", "ד", "ה", "ו", "ש"];

function getMonthGrid(year: number, month: number): Date[] {
  const firstOfMonth = new Date(year, month, 1);
  const start = new Date(firstOfMonth);
  start.setDate(start.getDate() - start.getDay());
  return Array.from({ length: 42 }, (_, index) => {
    const date = new Date(start);
    date.setDate(start.getDate() + index);
    return date;
  });
}

export default function MonthlyCalendar({ events }: { events: FamilyEvent[] }) {
  const today = new Date();
  const [monthOffset, setMonthOffset] = useState(0);
  const [selectedIso, setSelectedIso] = useState<string | null>(null);

  const viewDate = new Date(today.getFullYear(), today.getMonth() + monthOffset, 1);
  const year = viewDate.getFullYear();
  const month = viewDate.getMonth();
  const days = getMonthGrid(year, month);
  const todayIso = toISODate(today);

  const eventsByDate = new Map<string, FamilyEvent[]>();
  for (const event of events) {
    const list = eventsByDate.get(event.date) ?? [];
    list.push(event);
    eventsByDate.set(event.date, list);
  }

  const selectedEvents = selectedIso ? (eventsByDate.get(selectedIso) ?? []) : [];

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center justify-between rounded-2xl border border-amber-100 bg-white p-2 shadow-sm dark:border-amber-950/30 dark:bg-stone-900">
        <button
          type="button"
          onClick={() => setMonthOffset((value) => value - 1)}
          aria-label="חודש קודם"
          className="rounded-full p-2 text-stone-500 transition-colors hover:bg-amber-50 dark:text-stone-400 dark:hover:bg-stone-800"
        >
          <ChevronRight className="h-4 w-4" />
        </button>
        <div className="flex flex-col items-center">
          <span className="text-sm font-semibold text-stone-800 dark:text-stone-100">
            {MONTH_FORMATTER.format(viewDate)}
          </span>
          {monthOffset !== 0 && (
            <button
              type="button"
              onClick={() => setMonthOffset(0)}
              className="text-xs text-amber-600 hover:underline dark:text-amber-400"
            >
              החודש הנוכחי
            </button>
          )}
        </div>
        <button
          type="button"
          onClick={() => setMonthOffset((value) => value + 1)}
          aria-label="חודש הבא"
          className="rounded-full p-2 text-stone-500 transition-colors hover:bg-amber-50 dark:text-stone-400 dark:hover:bg-stone-800"
        >
          <ChevronLeft className="h-4 w-4" />
        </button>
      </div>

      <div className="grid grid-cols-7 gap-1 text-center text-xs font-medium text-stone-400 dark:text-stone-500">
        {WEEKDAY_SHORT.map((label) => (
          <span key={label}>{label}</span>
        ))}
      </div>

      <div className="grid grid-cols-7 gap-1">
        {days.map((date) => {
          const iso = toISODate(date);
          const isCurrentMonth = date.getMonth() === month;
          const isToday = iso === todayIso;
          const isSelected = iso === selectedIso;
          const dayEvents = eventsByDate.get(iso) ?? [];

          return (
            <button
              key={iso}
              type="button"
              onClick={() => setSelectedIso((value) => (value === iso ? null : iso))}
              className={`flex aspect-square flex-col items-center justify-center gap-0.5 rounded-xl border text-sm transition-colors ${
                !isCurrentMonth
                  ? "border-transparent text-stone-300 dark:text-stone-700"
                  : isSelected
                    ? "border-amber-400 bg-amber-500 text-white"
                    : isToday
                      ? "border-amber-300 bg-amber-50 font-bold text-amber-700 dark:border-amber-700 dark:bg-amber-950/30 dark:text-amber-400"
                      : "border-amber-100 bg-white text-stone-700 hover:bg-amber-50 dark:border-amber-950/30 dark:bg-stone-900 dark:text-stone-200 dark:hover:bg-stone-800"
              }`}
            >
              <span>{date.getDate()}</span>
              {dayEvents.length > 0 && (
                <span
                  className={`h-1.5 w-1.5 rounded-full ${isSelected ? "bg-white" : "bg-amber-500"}`}
                />
              )}
            </button>
          );
        })}
      </div>

      {selectedIso && (
        <div className="flex flex-col gap-2 rounded-2xl border border-amber-100 bg-white p-3 shadow-sm dark:border-amber-950/30 dark:bg-stone-900">
          <p className="text-sm font-bold text-stone-700 dark:text-stone-200">
            {HEBREW_WEEKDAY_NAMES[new Date(selectedIso).getDay()]}, {selectedIso}
          </p>
          {selectedEvents.length === 0 ? (
            <p className="text-xs text-stone-400 dark:text-stone-500">אין אירועים ביום זה</p>
          ) : (
            <ul className="flex flex-col gap-1.5">
              {selectedEvents.map((event) => (
                <li
                  key={event.id}
                  className="rounded-lg bg-amber-50/70 px-2 py-1.5 text-sm text-stone-700 dark:bg-stone-950/40 dark:text-stone-200"
                >
                  <p className="font-medium">
                    {event.title}
                    {event.time && (
                      <span className="mr-1.5 text-xs font-normal text-stone-500 dark:text-stone-400">
                        {formatTime(event.time)}
                      </span>
                    )}
                  </p>
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
      )}
    </div>
  );
}

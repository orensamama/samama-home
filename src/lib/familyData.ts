export const DEFAULT_QUOTE = "לך יש אותי, לי יש אותך, לנו יש אותנו";

export type FamilyEvent = {
  id: string;
  title: string;
  date: string; // ISO date, e.g. "2026-07-24" -- first day
  end_date: string | null; // ISO date, last day of a multi-day event; null means single-day
  time: string | null; // "HH:MM:SS" (Postgres time), or null if no time set
  location: string | null;
  notes: string | null;
  image_url: string | null;
};

export type ExpenseItem = {
  id: string;
  title: string;
  amount: number;
  amount_pending: boolean;
  notes: string | null;
  date: string; // ISO date, e.g. "2026-07-24"
};

export function formatDate(dateStr: string) {
  return new Intl.DateTimeFormat("he-IL", {
    weekday: "short",
    day: "numeric",
    month: "long",
  }).format(new Date(dateStr));
}

/** "14:30:00" (Postgres time) -> "14:30" */
export function formatTime(timeStr: string) {
  return timeStr.slice(0, 5);
}

/**
 * True once the event's LAST day (end_date if set, otherwise date) is
 * strictly before today -- an ongoing multi-day event that started in the
 * past but hasn't ended yet still counts as upcoming/current. Today
 * itself still counts as upcoming.
 */
export function isPastEvent(event: Pick<FamilyEvent, "date" | "end_date">): boolean {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const lastDay = new Date(event.end_date ?? event.date);
  lastDay.setHours(0, 0, 0, 0);
  return lastDay < today;
}

/** Whether a (possibly multi-day) event covers the given ISO date. */
export function eventOccursOnDate(event: Pick<FamilyEvent, "date" | "end_date">, iso: string): boolean {
  return iso >= event.date && iso <= (event.end_date ?? event.date);
}

/** "24 ביולי" for a single-day event, "24 ביולי - 28 ביולי" for a range. */
export function formatDateRange(event: Pick<FamilyEvent, "date" | "end_date">): string {
  if (!event.end_date || event.end_date === event.date) return formatDate(event.date);
  return `${formatDate(event.date)} - ${formatDate(event.end_date)}`;
}

export function formatCurrency(amount: number) {
  return new Intl.NumberFormat("he-IL", {
    style: "currency",
    currency: "ILS",
    maximumFractionDigits: 0,
  }).format(amount);
}

export const HEBREW_WEEKDAY_NAMES = ["ראשון", "שני", "שלישי", "רביעי", "חמישי", "שישי", "שבת"];

export function toISODate(date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

/** Sunday-to-Saturday dates for the week `weekOffset` weeks from the current one. */
export function getWeekDates(weekOffset: number): Date[] {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const sunday = new Date(today);
  sunday.setDate(today.getDate() - today.getDay() + weekOffset * 7);
  return Array.from({ length: 7 }, (_, index) => {
    const date = new Date(sunday);
    date.setDate(sunday.getDate() + index);
    return date;
  });
}

export const DEFAULT_QUOTE = "לך יש אותי, לי יש אותך, לנו יש אותנו";

export type FamilyEvent = {
  id: string;
  title: string;
  date: string; // ISO date, e.g. "2026-07-24"
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

/** Google Calendar "quick add" template link for a single event. */
export function buildGoogleCalendarUrl(event: FamilyEvent) {
  const dateCompact = event.date.replaceAll("-", "");
  let dates: string;

  if (event.time) {
    const [hours, minutes] = event.time.split(":");
    const start = new Date(`${event.date}T${event.time}`);
    const end = new Date(start.getTime() + 60 * 60 * 1000);
    const startCompact = `${dateCompact}T${hours}${minutes}00`;
    const endCompact = `${toISODate(end).replaceAll("-", "")}T${String(end.getHours()).padStart(2, "0")}${String(end.getMinutes()).padStart(2, "0")}00`;
    dates = `${startCompact}/${endCompact}`;
  } else {
    const nextDay = new Date(event.date);
    nextDay.setDate(nextDay.getDate() + 1);
    dates = `${dateCompact}/${toISODate(nextDay).replaceAll("-", "")}`;
  }

  const params = new URLSearchParams({
    action: "TEMPLATE",
    text: event.title,
    dates,
  });
  if (event.location) params.set("location", event.location);
  if (event.notes) params.set("details", event.notes);

  return `https://calendar.google.com/calendar/render?${params.toString()}`;
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

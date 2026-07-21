export const DEFAULT_QUOTE = "לך יש אותי, לי יש אותך, לנו יש אותנו";

export type FamilyEvent = {
  id: string;
  title: string;
  date: string; // ISO date, e.g. "2026-07-24"
  location: string | null;
  notes: string | null;
  image_url: string | null;
};

export type ExpenseItem = {
  id: string;
  title: string;
  amount: number;
  date: string; // ISO date, e.g. "2026-07-24"
};

export function formatDate(dateStr: string) {
  return new Intl.DateTimeFormat("he-IL", {
    weekday: "short",
    day: "numeric",
    month: "long",
  }).format(new Date(dateStr));
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

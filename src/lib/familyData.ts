export const DEFAULT_QUOTE = "לך יש אותי, לי יש אותך, לנו יש אותנו";

export type FamilyEvent = {
  id: string;
  title: string;
  date: string; // ISO date, e.g. "2026-07-24"
  location: string | null;
  notes: string | null;
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

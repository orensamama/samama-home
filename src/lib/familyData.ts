export const DEFAULT_QUOTE = "לך יש אותי, לי יש אותך, לנו יש אותנו";

export type TaskItem = {
  id: string;
  title: string;
  done: boolean;
};

export type ShoppingItem = {
  id: string;
  title: string;
  done: boolean;
};

export type FamilyEvent = {
  id: string;
  title: string;
  date: string; // ISO date, e.g. "2026-07-24"
};

export function formatEventDate(dateStr: string) {
  return new Intl.DateTimeFormat("he-IL", {
    weekday: "short",
    day: "numeric",
    month: "long",
  }).format(new Date(dateStr));
}

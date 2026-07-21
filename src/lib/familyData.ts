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

export const DEFAULT_TASKS: TaskItem[] = [
  { id: "1", title: "להביא את הילדים מהגן", done: false },
  { id: "2", title: "לשלם חשבון חשמל", done: false },
  { id: "3", title: "לקבוע תור לרופא שיניים", done: true },
];

export const DEFAULT_SHOPPING: ShoppingItem[] = [
  { id: "1", title: "חלב", done: false },
  { id: "2", title: "לחם", done: false },
  { id: "3", title: "ביצים", done: false },
  { id: "4", title: "פירות", done: true },
];

export const DEFAULT_EVENTS: FamilyEvent[] = [
  { id: "1", title: "ארוחת שישי במשפחה", date: "2026-07-24" },
  { id: "2", title: "תור לרופא ילדים", date: "2026-07-29" },
  { id: "3", title: "יום הולדת לאורית", date: "2026-08-02" },
];

export function formatEventDate(dateStr: string) {
  return new Intl.DateTimeFormat("he-IL", {
    weekday: "short",
    day: "numeric",
    month: "long",
  }).format(new Date(dateStr));
}

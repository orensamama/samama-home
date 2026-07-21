export type Assignee = "Oren" | "Orit" | "Shared" | "Other";
export type Urgency = "low" | "medium" | "high";
export type Status = "todo" | "in_progress" | "done";

export type Task = {
  id: string;
  title: string;
  assignee: Assignee;
  due_date: string | null;
  urgency: Urgency;
  status: Status;
  notes: string | null;
  category: string | null;
  is_personal: boolean;
  is_template: boolean;
  template_name: string | null;
  image_url: string | null;
  created_at: string;
};

export const ASSIGNEE_OPTIONS: { value: Assignee; label: string }[] = [
  { value: "Shared", label: "משותף" },
  { value: "Oren", label: "אורן" },
  { value: "Orit", label: "אורית" },
];

export const URGENCY_LEVELS: Record<Urgency, { label: string; color: string; dot: string }> = {
  low: {
    label: "נמוכה",
    color: "text-emerald-700 bg-emerald-50 dark:text-emerald-400 dark:bg-emerald-950/40",
    dot: "bg-emerald-500",
  },
  medium: {
    label: "בינונית",
    color: "text-amber-700 bg-amber-50 dark:text-amber-400 dark:bg-amber-950/40",
    dot: "bg-amber-500",
  },
  high: {
    label: "גבוהה",
    color: "text-rose-700 bg-rose-50 dark:text-rose-400 dark:bg-rose-950/40",
    dot: "bg-rose-500",
  },
};

export const STATUS_LEVELS: Record<Status, { label: string; color: string }> = {
  todo: {
    label: "לביצוע",
    color: "text-stone-600 bg-stone-100 dark:text-stone-300 dark:bg-stone-800",
  },
  in_progress: {
    label: "בתהליך",
    color: "text-sky-700 bg-sky-50 dark:text-sky-400 dark:bg-sky-950/40",
  },
  done: {
    label: "בוצע",
    color: "text-emerald-700 bg-emerald-50 dark:text-emerald-400 dark:bg-emerald-950/40",
  },
};

export const STATUS_CYCLE: Status[] = ["todo", "in_progress", "done"];

export const CATEGORY_SUGGESTIONS = ["בית", "עבודה", "בריאות", "כספים", "ילדים", "כללי"];

export function formatDueDate(dateStr: string) {
  return new Intl.DateTimeFormat("he-IL", { day: "numeric", month: "short" }).format(
    new Date(dateStr)
  );
}

export function isOverdue(dateStr: string, status: Status) {
  if (status === "done") return false;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return new Date(dateStr) < today;
}

const STATUS_ORDER: Record<Status, number> = { todo: 0, in_progress: 0, done: 1 };
const URGENCY_ORDER: Record<Urgency, number> = { high: 0, medium: 1, low: 2 };

export function sortTasks(tasks: Task[]) {
  return [...tasks].sort((a, b) => {
    const statusDiff = STATUS_ORDER[a.status] - STATUS_ORDER[b.status];
    if (statusDiff !== 0) return statusDiff;
    const urgencyDiff = URGENCY_ORDER[a.urgency] - URGENCY_ORDER[b.urgency];
    if (urgencyDiff !== 0) return urgencyDiff;
    if (a.due_date && b.due_date) return a.due_date.localeCompare(b.due_date);
    if (a.due_date) return -1;
    if (b.due_date) return 1;
    return a.created_at.localeCompare(b.created_at);
  });
}

export type BudgetKind = "income" | "fixed" | "variable" | "sinking";

export type BudgetCategory = {
  id: string;
  name: string;
  kind: BudgetKind;
  group_name: string;
  monthly_budget: number;
  sort_order: number;
  // Hidden (migration 0017) = out of the dashboard, the maths and the picker, history kept.
  is_hidden?: boolean;
};

export type BudgetExpense = {
  id: string;
  title: string;
  amount: number;
  amount_pending: boolean;
  notes: string | null;
  store: string | null;
  category_id: string | null;
  receipt_url: string | null;
  date: string; // ISO date, e.g. "2026-10-22"
};

export type MerchantCategory = {
  id: string;
  store_key: string;
  store_name: string;
  category_id: string;
};

// Shared query shapes, so every screen using them shares one cached fetch.
export const EXPENSE_SELECT =
  "id, title, amount, amount_pending, notes, store, category_id, receipt_url, date:expense_date";
export const EXPENSE_ORDER = { column: "expense_date", ascending: false } as const;
export const CATEGORY_ORDER = { column: "sort_order", ascending: true } as const;

export const KIND_ORDER: BudgetKind[] = ["income", "fixed", "variable", "sinking"];

export const KIND_META: Record<BudgetKind, { label: string; hint: string }> = {
  income: { label: "הכנסות קבועות", hint: "מה נכנס אלינו כל חודש" },
  fixed: { label: "הוצאות קבועות (\"שכח מזה\")", hint: "תשלומים קבועים שחוזרים כל חודש" },
  variable: { label: "הוצאות משתנות (ניהול שוטף)", hint: "מה שאנחנו מנהלים יום-יום" },
  sinking: { label: "הוצאות אחת לתקופה", hint: "חיסכון חודשי להוצאות גדולות (חופשות, חגים...)" },
};

// ---------------------------------------------------------------------------
// Months
// ---------------------------------------------------------------------------

/** "2026-10" for the month `offset` months from today. */
export function monthKeyFromOffset(offset: number): string {
  const now = new Date();
  const date = new Date(now.getFullYear(), now.getMonth() + offset, 1);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
}

export function formatMonthKey(key: string): string {
  const [year, month] = key.split("-").map(Number);
  return new Intl.DateTimeFormat("he-IL", { month: "long", year: "numeric" }).format(new Date(year, month - 1, 1));
}

/** A sensible default expense date inside the viewed month (today if it's the current one). */
export function defaultDateForMonth(key: string): string {
  const today = new Date();
  const todayIso = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}-${String(today.getDate()).padStart(2, "0")}`;
  return todayIso.startsWith(key) ? todayIso : `${key}-01`;
}

// ---------------------------------------------------------------------------
// Budget math
// ---------------------------------------------------------------------------

export type CategoryStatus = {
  category: BudgetCategory;
  spent: number; // for income categories: what was actually received
  budget: number;
  ratio: number; // spent / budget (0 when there's no budget)
};

export type BudgetSummary = {
  statuses: Map<string, CategoryStatus>;
  uncategorizedSpent: number;
  income: number;
  fixedCommitted: number;
  sinkingCommitted: number;
  variableSpent: number;
  variableBudget: number;
  totalSpent: number;
  /** Income minus committed fixed/sinking and what's already been spent on variable -- "how much is left to live on". */
  remaining: number;
};

const amountOf = (expense: BudgetExpense) => (expense.amount_pending ? 0 : Number(expense.amount) || 0);

export function computeBudgetSummary(
  categories: BudgetCategory[],
  expenses: BudgetExpense[],
  monthKey: string
): BudgetSummary {
  const spentByCategory = new Map<string, number>();
  let uncategorizedSpent = 0;
  let totalSpent = 0;

  for (const expense of expenses) {
    if (!expense.date.startsWith(monthKey)) continue;
    const amount = amountOf(expense);
    if (expense.category_id && categories.some((category) => category.id === expense.category_id)) {
      spentByCategory.set(expense.category_id, (spentByCategory.get(expense.category_id) ?? 0) + amount);
    } else {
      uncategorizedSpent += amount;
    }
  }

  const statuses = new Map<string, CategoryStatus>();
  let income = 0;
  let fixedCommitted = 0;
  let sinkingCommitted = 0;
  let variableSpent = 0;
  let variableBudget = 0;

  for (const category of categories) {
    const spent = spentByCategory.get(category.id) ?? 0;
    const budget = category.is_hidden ? 0 : Number(category.monthly_budget) || 0;
    statuses.set(category.id, { category, spent, budget, ratio: budget > 0 ? spent / budget : 0 });

    if (category.kind === "income") {
      // Received so far if anything was logged, otherwise the expected amount.
      income += spent > 0 ? spent : budget;
    } else {
      totalSpent += spent;
      // Fixed/sinking money is committed for the month even before it's paid.
      if (category.kind === "fixed") fixedCommitted += Math.max(spent, budget);
      else if (category.kind === "sinking") sinkingCommitted += Math.max(spent, budget);
      else {
        variableSpent += spent;
        variableBudget += budget;
      }
    }
  }
  totalSpent += uncategorizedSpent;
  variableSpent += uncategorizedSpent;

  return {
    statuses,
    uncategorizedSpent,
    income,
    fixedCommitted,
    sinkingCommitted,
    variableSpent,
    variableBudget,
    totalSpent,
    remaining: income - fixedCommitted - sinkingCommitted - variableSpent,
  };
}

export type ProgressTone = "green" | "orange" | "red" | "neutral";

/** Green under 75% of budget, orange up to 100%, red once over. */
export function progressTone(spent: number, budget: number): ProgressTone {
  if (budget <= 0) return spent > 0 ? "orange" : "neutral";
  const ratio = spent / budget;
  if (ratio > 1) return "red";
  if (ratio >= 0.75) return "orange";
  return "green";
}

export const TONE_CLASSES: Record<ProgressTone, { bar: string; text: string }> = {
  green: { bar: "bg-emerald-500", text: "text-emerald-700 dark:text-emerald-400" },
  orange: { bar: "bg-amber-500", text: "text-amber-700 dark:text-amber-400" },
  red: { bar: "bg-rose-500", text: "text-rose-700 dark:text-rose-400" },
  neutral: { bar: "bg-stone-300 dark:bg-stone-600", text: "text-stone-500 dark:text-stone-400" },
};

// ---------------------------------------------------------------------------
// Smart store recognition
// ---------------------------------------------------------------------------

export function normalizeStoreKey(name: string): string {
  return name
    .toLowerCase()
    .replace(/["'`׳״]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Best remembered category for a typed store name: exact match first, then
 * one containing the other (so "רמי לוי שיווק השקמה" still finds "רמי לוי").
 * Very short keys are ignored for the fuzzy case to avoid false matches.
 */
export function suggestMerchant(storeInput: string, merchants: MerchantCategory[]): MerchantCategory | null {
  const key = normalizeStoreKey(storeInput);
  if (!key) return null;
  const exact = merchants.find((merchant) => merchant.store_key === key);
  if (exact) return exact;
  if (key.length < 3) return null;
  let best: MerchantCategory | null = null;
  for (const merchant of merchants) {
    if (merchant.store_key.length < 3) continue;
    if (key.includes(merchant.store_key) || merchant.store_key.includes(key)) {
      if (!best || merchant.store_key.length > best.store_key.length) best = merchant;
    }
  }
  return best;
}

// ---------------------------------------------------------------------------
// Receipt text parsing (first-pass OCR heuristics)
// ---------------------------------------------------------------------------

export type ParsedReceipt = {
  amount: number | null;
  store: string | null;
  date: string | null; // ISO
  items: ReceiptItem[];
};

export type ReceiptItem = {
  name: string;
  qty: number | null;
  price: number;
};

function toNumber(raw: string): number | null {
  let cleaned = raw.replace(/\s/g, "");
  // "1,234.50" -> 1234.50 ; "12,50" -> 12.50 ; "1.234,50" -> 1234.50
  if (/,\d{2}$/.test(cleaned)) cleaned = cleaned.replace(/\./g, "").replace(",", ".");
  else cleaned = cleaned.replace(/,/g, "");
  const value = Number(cleaned);
  return Number.isFinite(value) ? value : null;
}

const AMOUNT_PATTERN = /\d{1,3}(?:[,\s]\d{3})*[.,]\d{2}|\d+[.,]\d{2}/g;
const TOTAL_KEYWORDS = /(סה["״']?כ|סהכ|לתשלום|סכום|total|amount|sum)/i;
const SKIP_STORE_LINE = /(חשבונית|קבלה|invoice|receipt|עוסק|ח\.?פ|טל[׳'.:]|tel|www|http|מס['׳]?\s|תאריך|date|\d{5,})/i;

// Lines that carry a number but are not purchased items.
const NON_ITEM_LINE =
  /(סה["״']?כ|סהכ|לתשלום|סכום|total|subtotal|amount|sum|מע["״']?מ|מעמ|vat|tax|עודף|עיגול|מזומן|אשראי|כרטיס|ויזה|מאסטר|visa|master|cash|change|credit|שולם|תשלום|הנחה|מבצע|חשבונית|קבלה|invoice|receipt|טל[׳'.:]|tel\b|עוסק|ח\.?פ|תאריך|date|שעה|קופה|קופאי|סניף|\d{1,2}[./-]\d{1,2}[./-]\d{2,4})/i;
const LETTERS = /[֐-׿a-zA-Z]{2,}/;
// "7.90" at the end of the line (typical LTR order) or at the start (RTL OCR order).
const PRICE_AT_END = /^(.*?)[\s:]*(\d{1,4}[.,]\d{2})\s*(?:₪|nis|ש"?ח)?\s*$/i;
const PRICE_AT_START = /^\s*(\d{1,4}[.,]\d{2})\s*(?:₪|nis|ש"?ח)?\s+(.*\S)\s*$/i;

/**
 * Best-effort purchased-items extraction from OCR text: any line that is a
 * product name plus a price (price on either end, since Hebrew OCR often
 * flips the order), with a quantity pulled out when written as "2x" / "x2" /
 * "כמות 2". Totals, VAT, payment and header lines are skipped. OCR on
 * receipts is noisy, so this is a convenience for the notes field and is
 * always shown for the user to review.
 */
export function extractReceiptItems(text: string, total: number | null): ReceiptItem[] {
  const items: ReceiptItem[] = [];

  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || NON_ITEM_LINE.test(line)) continue;

    let namePart: string | null = null;
    let priceRaw: string | null = null;
    const atEnd = line.match(PRICE_AT_END);
    if (atEnd && atEnd[1].trim()) {
      namePart = atEnd[1];
      priceRaw = atEnd[2];
    } else {
      const atStart = line.match(PRICE_AT_START);
      if (atStart) {
        priceRaw = atStart[1];
        namePart = atStart[2];
      }
    }
    if (namePart === null || priceRaw === null) continue;

    const price = toNumber(priceRaw);
    if (price === null || price <= 0 || price > 9999) continue;
    if (total !== null && price > total) continue;

    let qty: number | null = null;
    let name = namePart;
    const qtyMatch =
      name.match(/(?:^|\s)(\d{1,3})\s*[xX×*]\s*(?=\S)/) ??
      name.match(/\s[xX×*]\s*(\d{1,3})(?:\s|$)/) ??
      name.match(/כמות\s*:?\s*(\d{1,3})/);
    if (qtyMatch) {
      const value = Number(qtyMatch[1]);
      if (value >= 1 && value <= 99) qty = value;
      name = name.replace(qtyMatch[0], " ");
    }

    name = name
      .replace(/\d{6,}/g, " ") // barcodes / SKUs
      .replace(/[^֐-׿a-zA-Z0-9 '"%.-]/g, " ")
      .replace(/\s+/g, " ")
      .trim();
    if (!LETTERS.test(name) || name.length < 2) continue;

    items.push({ name: name.slice(0, 40), qty, price });
    if (items.length >= 40) break;
  }

  return items;
}

/** The text saved into an expense's notes from scanned line items. */
export function formatReceiptItems(items: ReceiptItem[]): string {
  if (items.length === 0) return "";
  return [
    "פירוט קנייה:",
    ...items.map((item) => `• ${item.name}${item.qty && item.qty > 1 ? ` x${item.qty}` : ""} - ${item.price.toFixed(2)} ₪`),
  ].join("\n");
}

export function parseReceiptText(text: string): ParsedReceipt {
  const lines = text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);

  // Amount: a number on a "total"-style line wins; otherwise the largest decimal figure.
  let amount: number | null = null;
  for (const line of lines) {
    if (!TOTAL_KEYWORDS.test(line)) continue;
    const matches = line.match(AMOUNT_PATTERN);
    if (matches) {
      const values = matches.map(toNumber).filter((value): value is number => value !== null);
      if (values.length > 0) amount = Math.max(...values);
    }
  }
  if (amount === null) {
    const all = (text.match(AMOUNT_PATTERN) ?? []).map(toNumber).filter((value): value is number => value !== null);
    if (all.length > 0) amount = Math.max(...all);
  }

  // Date: dd/mm/yyyy, dd.mm.yy, dd-mm-yyyy (Israeli day-first order).
  let date: string | null = null;
  const dateMatch = text.match(/\b(\d{1,2})[./-](\d{1,2})[./-](\d{4}|\d{2})\b/);
  if (dateMatch) {
    const day = Number(dateMatch[1]);
    const month = Number(dateMatch[2]);
    const year = dateMatch[3].length === 2 ? 2000 + Number(dateMatch[3]) : Number(dateMatch[3]);
    if (day >= 1 && day <= 31 && month >= 1 && month <= 12 && year >= 2000 && year <= 2100) {
      date = `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
    }
  }

  // Store: the first line that looks like a name (letters, not an id/phone/heading).
  let store: string | null = null;
  for (const line of lines.slice(0, 8)) {
    if (SKIP_STORE_LINE.test(line)) continue;
    if (!/[֐-׿a-zA-Z]{2,}/.test(line)) continue;
    store = line.replace(/[^֐-׿a-zA-Z0-9 '"&.-]/g, "").trim().slice(0, 40) || null;
    if (store) break;
  }

  return { amount, store, date, items: extractReceiptItems(text, amount) };
}

/** How many months an ISO date is from the current month (0 = this month, -1 = last month...). */
export function monthOffsetFromDate(iso: string): number {
  const now = new Date();
  const [year, month] = iso.split("-").map(Number);
  return (year - now.getFullYear()) * 12 + (month - 1 - now.getMonth());
}

/** The expense form's values (shared by the dashboard widget and the budget screen). */
export type ExpenseFormValues = {
  amount: string;
  amount_pending: boolean;
  store: string;
  category_id: string; // "" = no category
  date: string;
  notes: string;
  receipt_url: string;
  /** Re-learn store -> category after the user overrode a remembered one. */
  remember_mapping: boolean;
};

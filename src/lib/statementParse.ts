// Parsing of credit-card / bank statements (CSV, Excel rows, PDF text lines) and of pasted text
// (a credit-card SMS, a line copied from the card app). Pure functions, no imports, so they are
// easy to test on their own. Every amount comes out positive; `direction` says which way it went.

export type StatementDirection = "expense" | "credit";

export type ParsedTransaction = {
  /** ISO date, e.g. "2026-11-05" */
  date: string;
  merchant: string;
  /** Always > 0 */
  amount: number;
  /** "credit" = a refund / deposit (not imported unless the user ticks it) */
  direction: StatementDirection;
};

const INVISIBLE = /[‎‏‪-‮ ]/g;
const CURRENCY = /₪|ש"ח|ש״ח|ש''ח|שח|ILS|NIS/gi;

function pad(value: number): string {
  return String(value).padStart(2, "0");
}

export function toIsoDate(date: Date): string {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

/** "1,234.50", "₪ 89.9", "(45.00)", "45.00-", "-45", "12,50" -> number; anything else -> null. */
export function parseAmount(raw: string | number | null | undefined): number | null {
  if (raw === null || raw === undefined) return null;
  if (typeof raw === "number") return Number.isFinite(raw) ? raw : null;
  let text = raw.replace(INVISIBLE, "").replace(/\s+/g, "").replace(CURRENCY, "");
  if (!text) return null;
  let negative = false;
  if (/^\(.*\)$/.test(text)) {
    negative = true;
    text = text.slice(1, -1);
  }
  if (text.startsWith("-") || text.startsWith("−")) {
    negative = true;
    text = text.slice(1);
  }
  if (text.endsWith("-")) {
    negative = true;
    text = text.slice(0, -1);
  }
  if (!/^\d[\d,]*(\.\d+)?$/.test(text)) return null;
  // "12,50" is a decimal comma; "1,234" and "1,234.50" are thousands separators.
  text = /^\d+,\d{1,2}$/.test(text) ? text.replace(",", ".") : text.replace(/,/g, "");
  const value = Number(text);
  if (!Number.isFinite(value)) return null;
  return negative ? -value : value;
}

function buildIso(year: number, month: number, day: number): string | null {
  if (month < 1 || month > 12 || day < 1 || day > 31) return null;
  const date = new Date(year, month - 1, day);
  if (date.getFullYear() !== year || date.getMonth() !== month - 1 || date.getDate() !== day) return null;
  return toIsoDate(date);
}

/** A date written without a year means "the most recent such day": this year, or last year if that is still ahead. */
function inferYear(month: number, day: number, today: Date): number {
  const thisYear = new Date(today.getFullYear(), month - 1, day);
  const limit = new Date(today.getFullYear(), today.getMonth(), today.getDate() + 7);
  return thisYear.getTime() > limit.getTime() ? today.getFullYear() - 1 : today.getFullYear();
}

function dateFromParts(a: string, b: string, c: string | undefined, today: Date): string | null {
  const day = Number(a);
  const month = Number(b);
  let year: number;
  if (c === undefined) year = inferYear(month, day, today);
  else year = c.length === 2 ? 2000 + Number(c) : Number(c);
  return buildIso(year, month, day);
}

/** The whole text is a date: 2026-11-05, 05/11/2026, 5.11.26, 05/11. */
export function parseDateText(raw: string, today: Date = new Date()): string | null {
  const text = raw.replace(INVISIBLE, "").trim();
  const iso = /^(\d{4})-(\d{1,2})-(\d{1,2})(?:[T\s].*)?$/.exec(text);
  if (iso) return buildIso(Number(iso[1]), Number(iso[2]), Number(iso[3]));
  const local = /^(\d{1,2})[./-](\d{1,2})(?:[./-](\d{4}|\d{2}))?$/.exec(text);
  if (local) return dateFromParts(local[1], local[2], local[3], today);
  return null;
}

/** The first date written anywhere inside a longer text (with the matched text, to cut it out). */
export function findDate(text: string, today: Date = new Date()): { iso: string; raw: string } | null {
  const pattern = /(?<![\d.])(\d{1,2})[./-](\d{1,2})(?:[./-](\d{4}|\d{2}))?(?![\d])/g;
  for (const match of text.matchAll(pattern)) {
    const iso = dateFromParts(match[1], match[2], match[3], today);
    if (iso) return { iso, raw: match[0] };
  }
  const isoMatch = /(?<!\d)(\d{4})-(\d{2})-(\d{2})(?!\d)/.exec(text);
  if (isoMatch) {
    const iso = buildIso(Number(isoMatch[1]), Number(isoMatch[2]), Number(isoMatch[3]));
    if (iso) return { iso, raw: isoMatch[0] };
  }
  return null;
}

// ---------------------------------------------------------------------------
// CSV
// ---------------------------------------------------------------------------

/** Splits CSV text into rows of cells: quotes, doubled quotes, and the delimiter (comma, semicolon or tab) detected. */
export function parseCsv(input: string): string[][] {
  const text = input.replace(/^﻿/, "");
  const sample = text.split(/\r?\n/).filter((line) => line.trim()).slice(0, 8).join("\n");
  const counts: Record<string, number> = { ",": 0, ";": 0, "\t": 0 };
  let inQuotes = false;
  for (const char of sample) {
    if (char === '"') inQuotes = !inQuotes;
    else if (!inQuotes && char in counts) counts[char] += 1;
  }
  const delimiter = (Object.keys(counts) as string[]).reduce((best, key) => (counts[key] > counts[best] ? key : best), ",");

  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  inQuotes = false;
  for (let index = 0; index < text.length; index++) {
    const char = text[index];
    if (inQuotes) {
      if (char === '"') {
        if (text[index + 1] === '"') {
          cell += '"';
          index += 1;
        } else inQuotes = false;
      } else cell += char;
    } else if (char === '"') {
      inQuotes = true;
    } else if (char === delimiter) {
      row.push(cell);
      cell = "";
    } else if (char === "\n" || char === "\r") {
      if (char === "\r" && text[index + 1] === "\n") index += 1;
      row.push(cell);
      cell = "";
      if (row.some((value) => value.trim() !== "")) rows.push(row);
      row = [];
    } else cell += char;
  }
  row.push(cell);
  if (row.some((value) => value.trim() !== "")) rows.push(row);
  return rows;
}

// ---------------------------------------------------------------------------
// Tables (CSV / Excel): header row detection, then column mapping
// ---------------------------------------------------------------------------

const DATE_HEADERS = [/תאריך\s*(עסקה|רכישה|ביצוע|פעולה)/, /^\s*תאריך\s*$/, /תאריך|date/i];
const MERCHANT_HEADERS = [/שם\s*בית\s*ה?עסק/, /בית\s*ה?עסק/, /תיאור|תאור|פירוט|פרטים|description|merchant|payee/i, /שם/];
const AMOUNT_HEADERS = [/סכום\s*ב?חיוב/, /סכום\s*עסקה/, /^\s*סכום\s*$/, /סכום|amount/i, /חיוב/];
const DEBIT_HEADER = /חובה|debit/i;
const CREDIT_HEADER = /זכות|credit/i;

function findColumn(headers: string[], patterns: RegExp[], exclude: Set<number> = new Set()): number {
  for (const pattern of patterns) {
    const index = headers.findIndex((header, position) => !exclude.has(position) && pattern.test(header));
    if (index >= 0) return index;
  }
  return -1;
}

function cellText(value: unknown): string {
  if (value === null || value === undefined) return "";
  // Excel date cells arrive as midnight UTC.
  if (value instanceof Date) {
    return Number.isNaN(value.getTime()) ? "" : `${value.getUTCFullYear()}-${pad(value.getUTCMonth() + 1)}-${pad(value.getUTCDate())}`;
  }
  return String(value).replace(INVISIBLE, " ").trim();
}

function cellAmount(value: unknown): number | null {
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  return parseAmount(cellText(value));
}

function cleanMerchant(value: string): string {
  return value.replace(/\s+/g, " ").replace(/^[\s\-–:,.]+|[\s\-–:,.]+$/g, "").trim();
}

/** Rows of a statement table -> transactions. Uses the header row when there is one, else guesses per row. */
export function rowsToTransactions(rows: unknown[][], today: Date = new Date()): ParsedTransaction[] {
  const cells = rows.map((row) => row.map(cellText));
  let headerRow = -1;
  let dateCol = -1;
  let merchantCol = -1;
  let amountCol = -1;
  let debitCol = -1;
  let creditCol = -1;

  for (let index = 0; index < Math.min(cells.length, 25); index++) {
    const headers = cells[index];
    const date = findColumn(headers, DATE_HEADERS);
    if (date < 0) continue;
    const used = new Set([date]);
    const debit = headers.findIndex((header, position) => !used.has(position) && DEBIT_HEADER.test(header));
    const credit = headers.findIndex((header, position) => !used.has(position) && CREDIT_HEADER.test(header));
    const amount = findColumn(headers, AMOUNT_HEADERS, used);
    if (amount < 0 && (debit < 0 || credit < 0) && debit < 0 && credit < 0) continue;
    used.add(amount);
    if (debit >= 0) used.add(debit);
    if (credit >= 0) used.add(credit);
    headerRow = index;
    dateCol = date;
    amountCol = amount;
    debitCol = debit;
    creditCol = credit;
    merchantCol = findColumn(headers, MERCHANT_HEADERS, used);
    break;
  }

  const out: ParsedTransaction[] = [];

  if (headerRow >= 0) {
    for (let index = headerRow + 1; index < rows.length; index++) {
      const row = rows[index];
      const date = parseDateText(cellText(row[dateCol]), today);
      if (!date) continue;
      let amount: number | null = null;
      let direction: StatementDirection = "expense";
      const debit = debitCol >= 0 ? cellAmount(row[debitCol]) : null;
      const credit = creditCol >= 0 ? cellAmount(row[creditCol]) : null;
      if (debit && debit !== 0) {
        amount = Math.abs(debit);
      } else if (credit && credit !== 0) {
        amount = Math.abs(credit);
        direction = "credit";
      } else if (amountCol >= 0) {
        const value = cellAmount(row[amountCol]);
        if (value && value !== 0) {
          amount = Math.abs(value);
          if (value < 0) direction = "credit";
        }
      }
      if (amount === null) continue;
      const merchant = cleanMerchant(merchantCol >= 0 ? cellText(row[merchantCol]) : "");
      out.push({ date, merchant: merchant || "ללא שם", amount, direction });
    }
    return out;
  }

  // No recognisable header: a date cell, a number cell (the last one is the charge) and the longest text cell.
  for (const row of cells) {
    let date: string | null = null;
    let dateIndex = -1;
    row.forEach((value, index) => {
      if (date) return;
      const parsed = parseDateText(value, today);
      if (parsed) {
        date = parsed;
        dateIndex = index;
      }
    });
    if (!date) continue;
    let amount: number | null = null;
    let merchant = "";
    row.forEach((value, index) => {
      if (index === dateIndex || !value) return;
      const parsed = parseAmount(value);
      if (parsed !== null) {
        if (parsed !== 0) amount = parsed;
      } else if (/[A-Za-z֐-׿]/.test(value) && value.length > merchant.length) {
        merchant = value;
      }
    });
    if (amount === null) continue;
    const value: number = amount;
    out.push({ date, merchant: cleanMerchant(merchant) || "ללא שם", amount: Math.abs(value), direction: value < 0 ? "credit" : "expense" });
  }
  return out;
}

// ---------------------------------------------------------------------------
// Free text: a credit-card SMS, a pasted line, lines read from a PDF
// ---------------------------------------------------------------------------

const NUM = String.raw`\d{1,3}(?:,\d{3})+(?:\.\d{1,2})?|\d+(?:\.\d{1,2})?`;
const CURRENCY_SOURCE = String.raw`(?:₪|ש"ח|ש״ח|ש''ח|שח|ILS|NIS)`;
const EXPLICIT_AMOUNTS = [
  new RegExp(String.raw`(?:בסך|סך|סכום(?:\s*של)?|בסכום|חויבת\s*ב|חיוב\s*של)\s*:?\s*₪?\s*(${NUM})`),
  new RegExp(String.raw`(${NUM})\s*${CURRENCY_SOURCE}`, "i"),
  new RegExp(String.raw`₪\s*(${NUM})`),
];

function findExplicitAmount(text: string): { value: number; raw: string } | null {
  for (const pattern of EXPLICIT_AMOUNTS) {
    const match = pattern.exec(text);
    if (match) {
      const value = parseAmount(match[1]);
      if (value !== null && value > 0) return { value, raw: match[0] };
    }
  }
  return null;
}

/** A bare number in a statement line ("... 150.00"): the last one with decimals, else the last number. */
function findLooseAmount(text: string, allowIntegers: boolean): { value: number; raw: string } | null {
  const tokens = text.split(/\s+/).filter(Boolean);
  let withDecimals: { value: number; raw: string } | null = null;
  let any: { value: number; raw: string } | null = null;
  tokens.forEach((token, index) => {
    const value = parseAmount(token);
    if (value === null || value === 0) return;
    // "כרטיס 1234" / "המסתיים ב-1234": the last four digits of a card, not money.
    if (/^\d{4}$/.test(token) && /כרטיס|בכרטיסך|מסתיים|המסתיים|ב-?$/.test(tokens[index - 1] ?? "")) return;
    const candidate = { value: Math.abs(value), raw: token };
    any = candidate;
    if (/[.,]\d{1,2}$/.test(token)) withDecimals = candidate;
  });
  return withDecimals ?? (allowIntegers ? any : null);
}

const MERCHANT_KEYWORD =
  /(?:בבית\s*ה?עסק|בית\s*ה?עסק|בבית\s*עסק|אצל|בחנות|בעסק)\s*:?\s*(.+?)(?=\s+(?:בתאריך|ביום|בסך|על\s*סך|בסכום|סכום|בשעה|ב-?\d|\d)|[.,;()]|$)/;

const NOISE =
  /בוצעה|בוצע|עסקת|עסקה|בכרטיסך|בכרטיס|כרטיס|המסתיים|מסתיים|אשראי|חויבת|חויב|חיוב|רכישה|על\s*סך|בסך|סכום|בתאריך|ביום|בשעה|הודעה|ישראכרט|ויזה|מאסטרקארד/g;

function merchantFromText(line: string, leftover: string): string {
  const keyword = MERCHANT_KEYWORD.exec(line);
  if (keyword) {
    const found = cleanMerchant(keyword[1].replace(CURRENCY, " "));
    if (found) return found;
  }
  let text = leftover.replace(CURRENCY, " ").replace(NOISE, " ").replace(/\bב?-?\d{4}\b/g, " ");
  text = text.replace(/(^|\s)ב[-־](?=\S)/g, "$1");
  return cleanMerchant(text);
}

const CREDIT_WORDS = /זיכוי|החזר|ביטול/;

/** One line of free text -> a transaction, or null when it has no amount. */
export function parseTextLine(line: string, today: Date = new Date()): ParsedTransaction | null {
  // "45 ש"ח בשופרסל": the Hebrew "in" prefix isn't part of the shop's name.
  const source = line
    .replace(INVISIBLE, " ")
    .replace(/\s+/g, " ")
    .replace(/(₪|ש"ח|ש״ח|שח)\s+ב(?=[א-ת]{3})/g, "$1 ")
    .trim();
  if (!source) return null;
  let work = source;
  let amount = findExplicitAmount(work);
  if (amount) work = work.replace(amount.raw, " ");
  const date = findDate(work, today);
  if (date) work = work.replace(date.raw, " ");
  if (!amount) {
    // A bare number is only trusted next to a date (a statement line) or when it has decimals.
    amount = findLooseAmount(work, date !== null);
    if (amount) work = work.replace(amount.raw, " ");
  }
  if (!amount) return null;
  const merchant = merchantFromText(source, work);
  return {
    date: date?.iso ?? toIsoDate(today),
    merchant: merchant || "ללא שם",
    amount: amount.value,
    direction: CREDIT_WORDS.test(source) ? "credit" : "expense",
  };
}

/**
 * Pasted text -> transactions. A short message (one SMS, even if it wraps over a few lines) is one
 * transaction; a longer paste is read line by line.
 */
export function parseTextTransactions(text: string, today: Date = new Date()): ParsedTransaction[] {
  const lines = text.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  if (lines.length === 0) return [];
  const perLine = lines.map((line) => parseTextLine(line, today));
  const withAmount = perLine.filter((entry): entry is ParsedTransaction => entry !== null);
  if (withAmount.length <= 1 && lines.length > 1) {
    const whole = parseTextLine(lines.join(" "), today);
    return whole ? [whole] : [];
  }
  return withAmount;
}

/** Whatever the user gave us (a CSV file's text, a pasted block, a PDF's lines) -> transactions. */
export function parseStatementText(text: string, today: Date = new Date()): ParsedTransaction[] {
  const rows = parseCsv(text);
  const wide = rows.filter((row) => row.length >= 3).length;
  if (rows.length > 0 && wide >= Math.max(2, rows.length / 2)) {
    const fromTable = rowsToTransactions(rows, today);
    if (fromTable.length > 0) return fromTable;
  }
  return parseTextTransactions(text, today);
}

// ---------------------------------------------------------------------------
// Duplicates
// ---------------------------------------------------------------------------

/** True for each parsed transaction that already exists (same day and same amount). */
export function findDuplicates(
  parsed: ParsedTransaction[],
  existing: { date: string; amount: number }[]
): boolean[] {
  const seen = new Set(existing.map((entry) => `${entry.date}|${Number(entry.amount).toFixed(2)}`));
  return parsed.map((entry) => seen.has(`${entry.date}|${entry.amount.toFixed(2)}`));
}

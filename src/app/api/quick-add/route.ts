import { timingSafeEqual } from "node:crypto";
import { createClient } from "@supabase/supabase-js";
import { resolveQuickCategory } from "@/lib/quickAdd";
import { normalizeStoreKey, type BudgetCategory, type MerchantCategory } from "@/lib/budgetData";

// Logs an expense from a link or an iOS Shortcut, with no screen involved:
//
//   GET /api/quick-add?amount=200&vendor=רמי לוי&token=<QUICK_ADD_TOKEN>
//
// Optional: category (a category name), date (YYYY-MM-DD), note. POST with a JSON body of the same
// fields works too, and the token may be sent as an `x-quick-add-token` header instead.
//
// This route can write to the family's ledger without a sign-in, so it is closed until the
// QUICK_ADD_TOKEN environment variable is set (Vercel project settings) and every call must carry it.

const MAX_AMOUNT = 1_000_000;
const WINDOW_MS = 60 * 1000;
const MAX_PER_WINDOW = 30;
const hits = new Map<string, number[]>();

function json(body: Record<string, unknown>, status = 200) {
  return Response.json(body, { status, headers: { "Cache-Control": "no-store" } });
}

function tokenMatches(given: string, expected: string): boolean {
  const a = Buffer.from(given);
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}

function rateLimited(request: Request): boolean {
  const key = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";
  const now = Date.now();
  const recent = (hits.get(key) ?? []).filter((at) => now - at < WINDOW_MS);
  recent.push(now);
  hits.set(key, recent);
  if (hits.size > 500) for (const [other, times] of hits) if (times.every((at) => now - at >= WINDOW_MS)) hits.delete(other);
  return recent.length > MAX_PER_WINDOW;
}

/** Today's date in Israel, as YYYY-MM-DD (the server runs in UTC). */
function todayInIsrael(): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Jerusalem", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
}

type Input = { amount?: unknown; vendor?: unknown; category?: unknown; date?: unknown; note?: unknown; token?: unknown };

async function handle(request: Request, input: Input) {
  const expected = process.env.QUICK_ADD_TOKEN;
  if (!expected) {
    return json({ ok: false, error: "not_configured", message: "ההוספה המהירה כבויה. יש להגדיר QUICK_ADD_TOKEN בהגדרות הפרויקט ב-Vercel." }, 503);
  }
  const given =
    String(input.token ?? "") ||
    request.headers.get("x-quick-add-token") ||
    request.headers.get("authorization")?.replace(/^Bearer\s+/i, "") ||
    "";
  if (!tokenMatches(given, expected)) return json({ ok: false, error: "unauthorized", message: "טוקן לא תקין." }, 401);
  if (rateLimited(request)) return json({ ok: false, error: "rate_limited", message: "יותר מדי בקשות, נסו שוב עוד רגע." }, 429);

  const amount = Number(String(input.amount ?? "").replace(",", "."));
  if (!Number.isFinite(amount) || amount <= 0 || amount > MAX_AMOUNT) {
    return json({ ok: false, error: "bad_amount", message: "חסר סכום תקין (amount)." }, 400);
  }
  const vendor = String(input.vendor ?? "").trim().slice(0, 80);
  const note = String(input.note ?? "").trim().slice(0, 200);
  const dateInput = String(input.date ?? "").trim();
  if (dateInput && !/^\d{4}-\d{2}-\d{2}$/.test(dateInput)) {
    return json({ ok: false, error: "bad_date", message: "התאריך צריך להיות בצורה YYYY-MM-DD." }, 400);
  }
  const date = dateInput || todayInIsrael();

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) return json({ ok: false, error: "no_database", message: "חיבור מסד הנתונים לא מוגדר בשרת." }, 500);
  const supabase = createClient(url, key, { auth: { persistSession: false } });

  const [categoriesResult, merchantsResult] = await Promise.all([
    supabase.from("budget_categories").select("*"),
    supabase.from("merchant_categories").select("*"),
  ]);
  if (categoriesResult.error) {
    console.error("[quick-add] could not read categories:", categoriesResult.error);
    return json({ ok: false, error: "database", message: "לא הצלחנו לקרוא את הקטגוריות." }, 502);
  }
  const categories = (categoriesResult.data ?? []) as BudgetCategory[];
  const merchants = (merchantsResult.data ?? []) as MerchantCategory[];

  const wantedName = String(input.category ?? "").trim();
  const byName = wantedName
    ? categories.find((category) => !category.is_hidden && category.kind !== "income" && normalizeStoreKey(category.name) === normalizeStoreKey(wantedName))
    : undefined;
  const category = byName ?? (vendor ? resolveQuickCategory(vendor, merchants, categories) : null);

  const { data, error } = await supabase
    .from("expenses")
    .insert({
      title: vendor || category?.name || "הוצאה",
      amount,
      amount_pending: false,
      expense_date: date,
      notes: note || "נוסף בהוספה מהירה",
      store: vendor || null,
      category_id: category?.id ?? null,
      receipt_url: null,
    })
    .select("id")
    .single();
  if (error) {
    console.error("[quick-add] insert failed:", error);
    return json({ ok: false, error: "database", message: "ההוצאה לא נשמרה." }, 502);
  }
  return json({
    ok: true,
    id: data?.id,
    amount,
    vendor: vendor || null,
    category: category?.name ?? null,
    date,
    message: `נרשמו ${amount} ₪${vendor ? ` ב${vendor}` : ""}${category ? ` · ${category.name}` : ""}`,
  });
}

export async function GET(request: Request) {
  const params = new URL(request.url).searchParams;
  return handle(request, {
    amount: params.get("amount"),
    vendor: params.get("vendor"),
    category: params.get("category"),
    date: params.get("date"),
    note: params.get("note"),
    token: params.get("token"),
  });
}

export async function POST(request: Request) {
  let body: Input = {};
  try {
    body = (await request.json()) as Input;
  } catch {
    // fall through: an empty body fails on the missing amount
  }
  return handle(request, body ?? {});
}

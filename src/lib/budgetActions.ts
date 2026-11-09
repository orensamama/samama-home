import type { PostgrestError } from "@supabase/supabase-js";
import { supabase } from "@/lib/supabaseClient";
import { logSupabaseError } from "@/lib/supabaseErrors";
import { isNetworkError } from "@/lib/syncQueue";
import { resolveQuickCategory } from "@/lib/quickAdd";
import {
  defaultDateForMonth,
  defaultFlowFor,
  monthKeyFromOffset,
  normalizeStoreKey,
  suggestMerchant,
  type BudgetCategory,
  type ExpenseFormValues,
  type MerchantCategory,
} from "@/lib/budgetData";
import { BUDGET_TEMPLATE_ROWS, DEFAULT_MERCHANTS } from "@/lib/budgetTemplate";

/**
 * Inserts/updates an expense, then teaches the store -> category memory:
 *  - a store we've never seen is learned automatically;
 *  - a store we already recognise keeps its mapping, unless the user picked a
 *    different category AND accepted the "remember this for next time" offer.
 */
export async function saveExpense(params: {
  values: ExpenseFormValues;
  editingId: string | null;
  categories: BudgetCategory[];
  merchants: MerchantCategory[];
}): Promise<{ error: PostgrestError | null; mappingSaved: boolean; flowSkipped: boolean }> {
  const { values, editingId, categories, merchants } = params;
  const store = values.store.trim();
  const category = categories.find((candidate) => candidate.id === values.category_id) ?? null;
  // Income is stored in an income category (its amount is added to the month's
  // income); for income the "store" field holds the source, not a shop.
  const isIncome = category?.kind === "income";

  const payload = {
    title: store || category?.name || (isIncome ? "הכנסה" : "הוצאה"),
    amount: values.amount_pending ? 0 : Number(values.amount),
    amount_pending: values.amount_pending,
    expense_date: values.date,
    notes: values.notes.trim() || null,
    store: store || null,
    category_id: category?.id ?? null,
    receipt_url: values.receipt_url || null,
    flow: values.flow, // recurring / variable (migration 0024)
  };

  const write = (row: Record<string, unknown>) =>
    editingId ? supabase.from("expenses").update(row).eq("id", editingId) : supabase.from("expenses").insert(row);

  let { error } = await write(payload);
  // The table doesn't have the `flow` column yet (SQL not run): still save the transaction, without it.
  let flowSkipped = false;
  if (error && (error.code === "PGRST204" || error.code === "42703") && /flow/i.test(error.message)) {
    const { flow: _flow, ...withoutFlow } = payload;
    void _flow;
    ({ error } = await write(withoutFlow));
    flowSkipped = true;
  }
  if (error) {
    logSupabaseError("שמירת הוצאה", error);
    return { error, mappingSaved: false, flowSkipped: false };
  }

  let mappingSaved = false;
  if (store && category && !isIncome) {
    const known = suggestMerchant(store, merchants);
    const shouldSave = !known || (known.category_id !== category.id && values.remember_mapping);
    if (shouldSave) {
      const { error: merchantError } = await upsertMerchant(store, category.id);
      if (merchantError) logSupabaseError("שמירת זיכרון חנות", merchantError);
      else mappingSaved = true;
    }
  }
  return { error: null, mappingSaved, flowSkipped };
}

/**
 * The quick-tap flow: a shop and an amount, dated today, filed under the category the shop points to.
 * The optional `note` ("קישוטים") is saved in the transaction's notes.
 */
export async function saveQuickExpense(params: {
  vendor: string;
  amount: number;
  note?: string;
  categories: BudgetCategory[];
  merchants: MerchantCategory[];
}) {
  const { vendor, amount, note = "", categories, merchants } = params;
  const category = resolveQuickCategory(vendor, merchants, categories);
  return saveExpense({
    values: {
      amount: String(amount),
      amount_pending: false,
      store: vendor,
      category_id: category?.id ?? "",
      date: defaultDateForMonth(monthKeyFromOffset(0)),
      notes: note,
      receipt_url: "",
      flow: defaultFlowFor(category?.kind),
      remember_mapping: false,
    },
    editingId: null,
    categories,
    merchants,
  });
}

export type ImportRow = { date: string; store: string; amount: number; categoryId: string };

/**
 * Inserts many transactions at once (a statement import). `flow` is left out on purpose: it is implied by the
 * category, and it keeps working before migration 0024 has been run. Stores we have never seen are learned.
 */
export async function importExpenses(params: {
  rows: ImportRow[];
  categories: BudgetCategory[];
  merchants: MerchantCategory[];
}): Promise<{ error: PostgrestError | null; inserted: number; learned: number }> {
  const { rows, categories, merchants } = params;
  const categoryById = new Map(categories.map((category) => [category.id, category]));
  const payload = rows.map((row) => {
    const category = categoryById.get(row.categoryId) ?? null;
    const store = row.store.trim();
    return {
      title: store || category?.name || "הוצאה",
      amount: row.amount,
      amount_pending: false,
      expense_date: row.date,
      notes: "יובא מדף חשבון",
      store: store || null,
      category_id: category?.id ?? null,
      receipt_url: null,
    };
  });

  let inserted = 0;
  for (let start = 0; start < payload.length; start += 100) {
    const chunk = payload.slice(start, start + 100);
    const { error } = await supabase.from("expenses").insert(chunk);
    if (error) {
      logSupabaseError("ייבוא תנועות", error);
      return { error, inserted, learned: 0 };
    }
    inserted += chunk.length;
  }

  // Teach the store -> category memory from the rows that got a spending category.
  const toLearn = new Map<string, { store: string; categoryId: string }>();
  for (const row of rows) {
    const category = categoryById.get(row.categoryId);
    const store = row.store.trim();
    if (!category || category.kind === "income" || !store || store === "ללא שם") continue;
    if (suggestMerchant(store, merchants)) continue;
    toLearn.set(normalizeStoreKey(store), { store, categoryId: category.id });
  }
  let learned = 0;
  for (const { store, categoryId } of toLearn.values()) {
    const { error } = await upsertMerchant(store, categoryId);
    if (error) logSupabaseError("שמירת זיכרון חנות", error);
    else learned += 1;
  }
  return { error: null, inserted, learned };
}

/**
 * Adds a custom category (e.g. a new income source such as "משכורת אורית" or "הכנסה חד פעמית") and
 * returns it, so the form can select it at once. Goes at the end of its kind's list.
 */
export async function createBudgetCategory(params: {
  name: string;
  kind: BudgetCategory["kind"];
  groupName: string;
  existing: BudgetCategory[];
}): Promise<{ category: BudgetCategory | null; error: PostgrestError | null }> {
  const maxOrder = params.existing.reduce((max, category) => Math.max(max, category.sort_order), 0);
  const { data, error } = await supabase
    .from("budget_categories")
    .insert({ name: params.name.trim(), kind: params.kind, group_name: params.groupName, monthly_budget: 0, sort_order: maxOrder + 10 })
    .select("*")
    .single();
  if (error) logSupabaseError("הוספת סעיף", error);
  return { category: (data as BudgetCategory | null) ?? null, error };
}

// --- store -> category mappings (table: merchant_categories) -------------

export async function upsertMerchant(storeName: string, categoryId: string) {
  const name = storeName.trim();
  return supabase.from("merchant_categories").upsert(
    {
      store_key: normalizeStoreKey(name),
      store_name: name,
      category_id: categoryId,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "store_key" }
  );
}

/**
 * Adds a store to the quick-add grid (or re-files it): remembers store -> category and stars it as a
 * "common store". Before migration 0019 there is no star column, so it falls back to the plain mapping.
 */
export async function saveQuickStore(storeName: string, categoryId: string) {
  const name = storeName.trim();
  const result = await supabase.from("merchant_categories").upsert(
    {
      store_key: normalizeStoreKey(name),
      store_name: name,
      category_id: categoryId,
      is_favorite: true,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "store_key" }
  );
  if (result.error && /is_favorite/i.test(result.error.message)) return upsertMerchant(name, categoryId);
  return result;
}

export async function updateMerchant(
  id: string,
  patch: { store_name?: string; category_id?: string; is_favorite?: boolean }
) {
  const next: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if (patch.category_id !== undefined) next.category_id = patch.category_id;
  if (patch.is_favorite !== undefined) next.is_favorite = patch.is_favorite;
  if (patch.store_name !== undefined) {
    next.store_name = patch.store_name.trim();
    next.store_key = normalizeStoreKey(patch.store_name);
  }
  return supabase.from("merchant_categories").update(next).eq("id", id);
}

export async function deleteMerchant(id: string) {
  return supabase.from("merchant_categories").delete().eq("id", id);
}

// --- setup check + first-run seeding -------------------------------------

export type SetupIssue = {
  area: string;
  message: string; // plain Hebrew, for the user
  technical: string; // raw Postgres/PostgREST error, for the "details" view
};

export type SetupResult = { ok: boolean; seeded: boolean; issues: SetupIssue[] };

function describeIssue(error: PostgrestError, table: string): SetupIssue {
  const code = error.code ?? "";
  let message: string;
  if (code === "42P01" || code === "PGRST205") message = `הטבלה "${table}" לא קיימת במסד הנתונים`;
  else if (code === "42703" || code === "PGRST204") message = `חסרה עמודה בטבלה "${table}"`;
  else if (code === "42501") message = `אין הרשאה לקרוא/לכתוב בטבלה "${table}" (Row Level Security)`;
  else message = `שגיאה בטבלה "${table}"`;
  return { area: table, message, technical: `${code} ${error.message}`.trim() };
}

/**
 * Makes sure the budget is usable, and says exactly what's wrong when it isn't:
 *  1. probes the three tables/columns the budget reads and writes -- the live
 *     database was set up by hand, so any of them may differ from the
 *     migrations -- and reports each problem in plain language;
 *  2. if the categories table is reachable but has no rows at all, FORCES the
 *     Excel base template (and common stores) in, re-checking server-side first
 *     so a stale local cache or a second device can't cause a duplicate seed.
 * Network failures (offline) are not problems and report ok with nothing done.
 */
export async function ensureBudgetSetup(): Promise<SetupResult> {
  const issues: SetupIssue[] = [];

  const categories = await supabase
    .from("budget_categories")
    .select("id, name, kind, group_name, monthly_budget, sort_order")
    .limit(1);
  if (categories.error) {
    if (isNetworkError(categories.error)) return { ok: true, seeded: false, issues: [] };
    issues.push(describeIssue(categories.error, "budget_categories"));
  }

  const merchants = await supabase.from("merchant_categories").select("id, store_key, store_name, category_id, is_favorite").limit(1);
  if (merchants.error && !isNetworkError(merchants.error)) issues.push(describeIssue(merchants.error, "merchant_categories"));

  const expenses = await supabase
    .from("expenses")
    .select("id, category_id, store, receipt_url, notes, amount_pending")
    .limit(1);
  if (expenses.error && !isNetworkError(expenses.error)) issues.push(describeIssue(expenses.error, "expenses"));

  let seeded = false;
  if (!categories.error && (categories.data?.length ?? 0) === 0) {
    const { data: inserted, error } = await supabase
      .from("budget_categories")
      .insert(BUDGET_TEMPLATE_ROWS)
      .select("id, name");
    if (error || !inserted) {
      if (error) {
        logSupabaseError("אכלוס תבנית תקציב ראשונית", error);
        issues.push({ ...describeIssue(error, "budget_categories"), message: "לא ניתן להוסיף את תבנית הבסיס לטבלת הקטגוריות" });
      }
    } else {
      seeded = true;
      const idByName = new Map<string, string>(inserted.map((row: { id: string; name: string }) => [row.name, row.id]));
      const merchantRows = DEFAULT_MERCHANTS.flatMap((merchant) => {
        const categoryId = idByName.get(merchant.category);
        return categoryId
          ? [{ store_key: merchant.store_key, store_name: merchant.store_name, category_id: categoryId }]
          : [];
      });
      if (merchantRows.length > 0 && !merchants.error) {
        const { error: merchantError } = await supabase
          .from("merchant_categories")
          .upsert(merchantRows, { onConflict: "store_key", ignoreDuplicates: true });
        if (merchantError) logSupabaseError("אכלוס חנויות ברירת מחדל", merchantError);
      }
    }
  }

  return { ok: issues.length === 0, seeded, issues };
}

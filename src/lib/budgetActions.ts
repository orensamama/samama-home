import type { PostgrestError } from "@supabase/supabase-js";
import { supabase } from "@/lib/supabaseClient";
import { logSupabaseError } from "@/lib/supabaseErrors";
import { isNetworkError } from "@/lib/syncQueue";
import {
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
}): Promise<{ error: PostgrestError | null; mappingSaved: boolean }> {
  const { values, editingId, categories, merchants } = params;
  const store = values.store.trim();
  const category = categories.find((candidate) => candidate.id === values.category_id) ?? null;

  const payload = {
    title: store || category?.name || "הוצאה",
    amount: values.amount_pending ? 0 : Number(values.amount),
    amount_pending: values.amount_pending,
    expense_date: values.date,
    notes: values.notes.trim() || null,
    store: store || null,
    category_id: category?.id ?? null,
    receipt_url: values.receipt_url || null,
  };

  const { error } = editingId
    ? await supabase.from("expenses").update(payload).eq("id", editingId)
    : await supabase.from("expenses").insert(payload);
  if (error) {
    logSupabaseError("שמירת הוצאה", error);
    return { error, mappingSaved: false };
  }

  let mappingSaved = false;
  if (store && category) {
    const known = suggestMerchant(store, merchants);
    const shouldSave = !known || (known.category_id !== category.id && values.remember_mapping);
    if (shouldSave) {
      const { error: merchantError } = await upsertMerchant(store, category.id);
      if (merchantError) logSupabaseError("שמירת זיכרון חנות", merchantError);
      else mappingSaved = true;
    }
  }
  return { error: null, mappingSaved };
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

export async function updateMerchant(id: string, patch: { store_name?: string; category_id?: string }) {
  const next: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if (patch.category_id !== undefined) next.category_id = patch.category_id;
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

  const merchants = await supabase.from("merchant_categories").select("id, store_key, store_name, category_id").limit(1);
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

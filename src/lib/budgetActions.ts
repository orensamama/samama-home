import type { PostgrestError } from "@supabase/supabase-js";
import { supabase } from "@/lib/supabaseClient";
import { logSupabaseError } from "@/lib/supabaseErrors";
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

// --- first-run seeding ---------------------------------------------------

/**
 * Loads the family Excel base template when (and only when) the database has
 * no budget categories at all. Re-checks against the server right before
 * inserting, so a stale empty local cache or a second device can't cause a
 * duplicate seed. Returns true if it seeded.
 */
export async function seedBudgetTemplateIfEmpty(): Promise<boolean> {
  const { data: existing, error: checkError } = await supabase.from("budget_categories").select("id").limit(1);
  if (checkError || !existing || existing.length > 0) return false;

  const { data: inserted, error } = await supabase
    .from("budget_categories")
    .insert(BUDGET_TEMPLATE_ROWS)
    .select("id, name");
  if (error || !inserted) {
    if (error) logSupabaseError("אכלוס תבנית תקציב ראשונית", error);
    return false;
  }

  const idByName = new Map<string, string>(inserted.map((row: { id: string; name: string }) => [row.name, row.id]));
  const merchantRows = DEFAULT_MERCHANTS.flatMap((merchant) => {
    const categoryId = idByName.get(merchant.category);
    return categoryId
      ? [{ store_key: merchant.store_key, store_name: merchant.store_name, category_id: categoryId }]
      : [];
  });
  if (merchantRows.length > 0) {
    const { error: merchantError } = await supabase
      .from("merchant_categories")
      .upsert(merchantRows, { onConflict: "store_key", ignoreDuplicates: true });
    if (merchantError) logSupabaseError("אכלוס חנויות ברירת מחדל", merchantError);
  }
  return true;
}

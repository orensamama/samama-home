import type { PostgrestError } from "@supabase/supabase-js";
import { supabase } from "@/lib/supabaseClient";
import type { ShoppingItem } from "@/lib/shoppingData";

/**
 * Adds (or, if an active row for the same product/title already exists,
 * merges into) a shopping-list item. Always goes through the
 * upsert_shopping_item DB function (migration 0013) instead of a plain
 * insert, so the check-and-merge is atomic on the server -- immune to
 * the double-click/double-import race a client-side "check then insert"
 * can't fully close on its own, and the single guaranteed source of the
 * "no duplicate active rows" rule (also enforced by a unique index).
 */
export async function upsertShoppingItem(params: {
  productId: string | null;
  title: string;
  category: string | null;
  qty: number;
  addedBy?: string;
}): Promise<{ data: ShoppingItem | null; error: PostgrestError | null }> {
  const { data, error } = await supabase.rpc("upsert_shopping_item", {
    p_product_id: params.productId,
    p_title: params.title,
    p_category: params.category,
    p_qty: params.qty,
    p_added_by: params.addedBy ?? "Shared",
  });
  return { data: (data as ShoppingItem | null) ?? null, error };
}

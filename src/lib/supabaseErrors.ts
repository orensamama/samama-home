import type { PostgrestError } from "@supabase/supabase-js";

export function logSupabaseError(context: string, error: PostgrestError) {
  console.error(`[Supabase] ${context}:`, error.message, error);
}

// 42703 = undefined_column, PGRST204 = column missing from schema cache,
// PGRST205 = table not found -- all three mean the live DB schema doesn't
// match what the app expects (a migration hasn't been run).
const SCHEMA_MISMATCH_CODES = new Set(["42703", "PGRST204", "PGRST205"]);

export function friendlyErrorMessage(error: PostgrestError) {
  if (SCHEMA_MISMATCH_CODES.has(error.code)) {
    return "השמירה נכשלה: מבנה הטבלה בשרת לא מעודכן. יש להריץ את מיגרציית ה-SQL בסופאבייס.";
  }
  return `השמירה נכשלה: ${error.message}`;
}

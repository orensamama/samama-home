import type { PostgrestError } from "@supabase/supabase-js";
import { supabase } from "@/lib/supabaseClient";
import { logSupabaseError } from "@/lib/supabaseErrors";
import { resizeForUpload } from "@/lib/ocrImage";
import {
  embedFromUrl,
  emptyDraft,
  looksLikeRecipeText,
  parseRecipeText,
  type Recipe,
  type RecipeDraft,
  type RecipeTag,
} from "@/lib/recipeData";

// --- recipes ----------------------------------------------------------------
//
// The live `recipes` table may not match the migration exactly (it was created by
// hand before the module existed), so every write:
//  * sends the app's columns AND the mirrored ones (tags, notes, media_url, source_type),
//  * never sends `undefined` (arrays default to [], optional text to null),
//  * logs the full Supabase error (code, message, details, hint, columns sent), and
//  * heals itself: a column the table doesn't have is dropped from the request, a
//    NOT NULL column we didn't fill gets a neutral default -- then it retries.

type Row = Record<string, unknown>;

/** Columns that must hold an array / a number / a boolean when a NOT NULL constraint demands a value. */
const ARRAY_COLUMNS = new Set(["categories", "tags", "ingredients"]);

function defaultFor(column: string): unknown {
  if (ARRAY_COLUMNS.has(column)) return [];
  if (column === "servings") return 4;
  if (column === "is_favorite") return false;
  if (column === "created_at" || column === "updated_at") return new Date().toISOString();
  return "";
}

/** The kind of source: a video platform, a plain link, pasted/imported text, or typed by hand. */
function sourceTypeOf(sourceUrl: string | null, originalText: string | null): string {
  if (sourceUrl) return embedFromUrl(sourceUrl)?.platform ?? "link";
  return originalText ? "text" : "manual";
}

/** Adds the mirrored legacy columns so the row also fits a table that uses those names. */
function withMirrors(row: Row): Row {
  const out: Row = { ...row };
  if ("categories" in out) out.tags = out.categories;
  if ("tips" in out) out.notes = out.tips;
  if ("embed_url" in out || "source_url" in out) {
    const embed = (out.embed_url as string | null | undefined) ?? null;
    const source = (out.source_url as string | null | undefined) ?? null;
    out.media_url = embed ?? source;
    out.source_type = sourceTypeOf(source, (out.original_text as string | null | undefined) ?? null);
  }
  if (typeof out.servings === "number") out.servings = Math.max(1, Math.round(out.servings));
  return out;
}

function toRow(draft: RecipeDraft): Row {
  return withMirrors({
    title: draft.title.trim() || "מתכון ללא שם",
    categories: draft.categories ?? [],
    servings: draft.servings ?? null,
    ingredients: (draft.ingredients ?? []).map((line) => line.trim()).filter(Boolean),
    instructions: draft.instructions ?? "",
    tips: draft.tips ?? "",
    description: draft.description ?? "",
    source_url: draft.source_url ?? null,
    embed_url: draft.embed_url ?? null,
    image_url: draft.image_url ?? null,
    original_text: draft.original_text ?? null,
    ...(draft.is_favorite !== undefined ? { is_favorite: draft.is_favorite } : {}),
    updated_at: new Date().toISOString(),
  });
}

// --- what the live table actually looks like -----------------------------------------

export type RecipesSchema = {
  source: "openapi" | "probe";
  /** column name -> its declared type ("" when unknown) */
  columns: Map<string, string>;
  /** NOT NULL columns without a default (only known from the OpenAPI description) */
  required: string[];
};

const KNOWN_COLUMNS = [
  "id", "title", "categories", "tags", "servings", "ingredients", "instructions", "tips", "notes", "description",
  "source_url", "embed_url", "media_url", "source_type", "image_url", "original_text", "is_favorite", "created_at", "updated_at",
];

let schemaCache: { at: number; value: Promise<RecipesSchema | null> } | null = null;

async function readSchema(): Promise<RecipesSchema | null> {
  // 1) PostgREST's own description of the table (types + required columns), when the project exposes it.
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (url && key) {
    try {
      const response = await fetch(`${url}/rest/v1/`, { headers: { apikey: key, Authorization: `Bearer ${key}` } });
      if (response.ok) {
        const spec = (await response.json()) as {
          definitions?: Record<string, { properties?: Record<string, { type?: string; format?: string }>; required?: string[] }>;
        };
        const table = spec.definitions?.recipes;
        if (table?.properties) {
          return {
            source: "openapi",
            columns: new Map(Object.entries(table.properties).map(([name, info]) => [name, `${info.type ?? ""}${info.format ? ` (${info.format})` : ""}`.trim()])),
            required: table.required ?? [],
          };
        }
      }
    } catch {
      // fall through to probing
    }
  }
  // 2) Ask for each column by name: a missing one errors.
  const probes = await Promise.all(
    KNOWN_COLUMNS.map(async (column) => ({ column, error: (await supabase.from("recipes").select(column).limit(1)).error }))
  );
  const columns = probes.filter(({ error }) => !error || (error.code !== "42703" && error.code !== "PGRST204" && !/does not exist/i.test(error.message)));
  // If every probe failed the same way the table itself is unreachable (missing / no permission): nothing to adapt to.
  if (columns.length === 0) return null;
  return { source: "probe", columns: new Map(columns.map(({ column }) => [column, ""])), required: [] };
}

/** Reads (and caches for a minute) the recipes table's real columns. Null when it can't be determined. */
export function loadRecipesSchema(force = false): Promise<RecipesSchema | null> {
  if (!force && schemaCache && Date.now() - schemaCache.at < 60_000) return schemaCache.value;
  const value = readSchema().catch(() => null);
  schemaCache = { at: Date.now(), value };
  return value;
}

/** Human-readable table structure, for the error dialog and the console. */
export async function describeRecipesTable(): Promise<string> {
  const schema = await loadRecipesSchema(true);
  if (!schema) return "לא ניתן לקרוא את מבנה הטבלה recipes (ייתכן שהיא לא קיימת, או שאין הרשאת קריאה).";
  const lines = Array.from(schema.columns, ([name, type]) => `${name}${type ? `: ${type}` : ""}${schema.required.includes(name) ? "  (חובה)" : ""}`);
  const missing = ["title", "categories", "ingredients", "instructions", "source_url", "description"].filter((name) => !schema.columns.has(name));
  return [`עמודות בטבלה recipes (${schema.source === "openapi" ? "לפי PostgREST" : "נבדק בשאילתות"}):`, ...lines, ...(missing.length > 0 ? [`חסרות עמודות שהאפליקציה כותבת: ${missing.join(", ")} - הריצו את ה-SQL (מיגרציה 0023)`] : [])].join("\n");
}

/** Fits a row to the real table: only existing columns, array/text/number shapes as declared, required ones filled. */
function adaptRow(row: Row, schema: RecipesSchema | null): Row {
  if (!schema) return row;
  const out: Row = {};
  for (const [key, value] of Object.entries(row)) {
    if (key !== "title" && !schema.columns.has(key)) continue;
    const type = schema.columns.get(key) ?? "";
    if (type.startsWith("string") && Array.isArray(value)) out[key] = value.join(key === "ingredients" ? "\n" : ", ");
    else if (type.startsWith("array") && value !== null && !Array.isArray(value)) out[key] = value === "" ? [] : [String(value)];
    else if ((type.startsWith("integer") || type.startsWith("number")) && typeof value === "string") out[key] = value === "" ? null : Number(value);
    else out[key] = value;
  }
  for (const column of schema.required) {
    if (column !== "id" && out[column] === undefined) out[column] = defaultFor(column);
  }
  return out;
}

async function writeRecipe(op: "insert" | "update", row: Row, id?: string, context = "שמירת מתכון") {
  const schema = await loadRecipesSchema();
  const sent: Row = adaptRow(row, schema);
  const dropped: string[] = Object.keys(row).filter((key) => !(key in sent));
  const filled: string[] = [];

  for (let attempt = 0; attempt < 14; attempt++) {
    const { error } =
      op === "insert"
        ? await supabase.from("recipes").insert(sent)
        : await supabase.from("recipes").update(sent).eq("id", id as string);
    if (!error) {
      if (dropped.length > 0 || filled.length > 0) {
        console.warn(
          `[Supabase] recipes: נשמר לאחר התאמה למבנה הטבלה. עמודות שלא קיימות בטבלה (הוסרו מהבקשה): [${dropped.join(", ")}]; עמודות NOT NULL שמולאו: [${filled.join(", ")}]. הריצו את מיגרציה 0023 כדי ליישר את הטבלה.`
        );
      }
      return { error: null };
    }

    // Everything needed to see which column or policy is blocking the save.
    console.error(`[Supabase] recipes ${op} נכשל (${context}):`, {
      code: error.code,
      message: error.message,
      details: error.details,
      hint: error.hint,
      columnsSent: Object.keys(sent),
      valueTypes: Object.fromEntries(Object.entries(sent).map(([key, value]) => [key, Array.isArray(value) ? `array(${value.length})` : value === null ? "null" : typeof value])),
      tableColumns: schema ? Object.fromEntries(schema.columns) : "unknown",
      requiredColumns: schema?.required ?? [],
    });

    // A column the table doesn't have (PostgREST: PGRST204, Postgres: 42703).
    const missing =
      error.code === "PGRST204"
        ? error.message.match(/'([^']+)' column/)?.[1]
        : error.code === "42703"
          ? error.message.match(/column "([^"]+)"/)?.[1]
          : undefined;
    if (missing && missing in sent && missing !== "title") {
      delete sent[missing];
      dropped.push(missing);
      continue;
    }
    // A NOT NULL column we left empty.
    const required = error.code === "23502" ? error.message.match(/column "([^"]+)"/)?.[1] : undefined;
    if (required && !filled.includes(required)) {
      sent[required] = defaultFor(required);
      filled.push(required);
      continue;
    }
    logSupabaseError(context, error);
    return { error };
  }
  return { error: { message: "too many retries", details: "", hint: "", code: "RETRY", name: "PostgrestError" } as PostgrestError };
}

export async function insertRecipe(draft: RecipeDraft) {
  return writeRecipe("insert", toRow(draft), undefined, "שמירת מתכון");
}

/** Saves the editor's whole draft over an existing recipe. */
export async function saveRecipeDraft(id: string, draft: RecipeDraft) {
  return writeRecipe("update", toRow(draft), id, "עדכון מתכון");
}

/** Changes just some fields (favorite flag, servings). */
export async function patchRecipe(id: string, patch: Partial<Recipe>) {
  const row: Row = { updated_at: new Date().toISOString() };
  for (const [key, value] of Object.entries(patch)) if (value !== undefined) row[key] = value;
  return writeRecipe("update", withMirrors(row), id, "עדכון מתכון");
}


export async function deleteRecipe(id: string) {
  const { error } = await supabase.from("recipes").delete().eq("id", id);
  if (error) logSupabaseError("מחיקת מתכון", error);
  return { error };
}

export async function uploadRecipeImage(file: File): Promise<{ url: string | null; error: string | null }> {
  try {
    const blob = await resizeForUpload(file);
    const path = `recipe-${crypto.randomUUID()}.jpg`;
    const { error } = await supabase.storage.from("recipe-images").upload(path, blob, { contentType: "image/jpeg" });
    if (error) {
      console.error("[Supabase] העלאת תמונת מתכון:", error.message, error);
      return { url: null, error: "העלאת התמונה נכשלה. ודאו שה-SQL של ספר המתכונים הורץ ב-Supabase." };
    }
    return { url: supabase.storage.from("recipe-images").getPublicUrl(path).data.publicUrl, error: null };
  } catch {
    return { url: null, error: "לא הצלחנו לעבד את התמונה." };
  }
}

// --- tags ---------------------------------------------------------------------

export async function addTag(name: string, sortOrder: number) {
  const { error } = await supabase.from("recipe_tags").insert({ name: name.trim(), sort_order: sortOrder });
  if (error) logSupabaseError("הוספת תגית", error);
  return { error };
}

async function rewriteRecipeCategories(recipes: Recipe[], map: (categories: string[]) => string[]) {
  const results = await Promise.all(
    recipes
      .map((recipe) => ({ recipe, next: map(recipe.categories) }))
      .filter(({ recipe, next }) => next.join("\u0000") !== recipe.categories.join("\u0000"))
      .map(({ recipe, next }) => supabase.from("recipes").update({ categories: next }).eq("id", recipe.id))
  );
  return results.find((result) => result.error)?.error ?? null;
}

/** Renames a tag everywhere: the family's tag list and every recipe that carries it. */
export async function renameTag(oldName: string, newNameRaw: string, tags: RecipeTag[], recipes: Recipe[]) {
  const newName = newNameRaw.trim();
  if (!newName || newName === oldName) return { error: null };
  const defined = tags.find((tag) => tag.name === oldName);
  const { error } = defined
    ? await supabase.from("recipe_tags").update({ name: newName }).eq("id", defined.id)
    : await supabase.from("recipe_tags").insert({ name: newName, sort_order: tags.length + 1 });
  if (error) {
    logSupabaseError("שינוי שם תגית", error);
    return { error };
  }
  const recipesError = await rewriteRecipeCategories(recipes, (cats) =>
    Array.from(new Set(cats.map((cat) => (cat === oldName ? newName : cat))))
  );
  return { error: recipesError };
}

/** Deletes a tag: removes it from the list and from every recipe (the recipes themselves stay). */
export async function deleteTag(name: string, tags: RecipeTag[], recipes: Recipe[]) {
  const defined = tags.find((tag) => tag.name === name);
  if (defined) {
    const { error } = await supabase.from("recipe_tags").delete().eq("id", defined.id);
    if (error) {
      logSupabaseError("מחיקת תגית", error);
      return { error };
    }
  }
  const recipesError = await rewriteRecipeCategories(recipes, (cats) => cats.filter((cat) => cat !== name));
  return { error: recipesError };
}

// --- links ----------------------------------------------------------------------

export type LinkInfo = {
  ok: boolean;
  url: string;
  title: string;
  description: string;
  image: string | null;
  embedUrl: string | null;
  platform: string | null;
  recipe: { ingredients: string[]; instructions: string; servings: number | null } | null;
  note?: string;
};

/** Asks the server to read a shared link (see /api/recipe-link). Null when the lookup itself failed. */
export async function fetchLinkInfo(url: string): Promise<LinkInfo | null> {
  try {
    const response = await fetch(`/api/recipe-link?url=${encodeURIComponent(url)}`);
    if (!response.ok) return null;
    return (await response.json()) as LinkInfo;
  } catch {
    return null;
  }
}

/**
 * Builds a recipe draft from a looked-up link: the site's own recipe data when it
 * publishes it, else the description text split into fields as written. The
 * original text is always kept.
 */
export function draftFromLink(url: string, info: LinkInfo | null, caption = ""): RecipeDraft {
  const draft = emptyDraft();
  draft.source_url = info?.url ?? url;
  draft.embed_url = info?.embedUrl ?? embedFromUrl(url)?.embedUrl ?? null;
  draft.image_url = info?.image ?? null;
  draft.title = (info?.title ?? "").trim();

  const description = (info?.description ?? "").trim();
  if (info?.recipe) {
    draft.ingredients = info.recipe.ingredients;
    draft.instructions = info.recipe.instructions;
    draft.servings = info.recipe.servings;
    draft.description = description;
  } else if (description && looksLikeRecipeText(description)) {
    const parsed = parseRecipeText(description);
    draft.ingredients = parsed.ingredients;
    draft.instructions = parsed.instructions;
    draft.tips = parsed.tips;
    draft.servings = parsed.servings;
    if (!draft.title) draft.title = parsed.title;
    draft.description = description;
    draft.original_text = description;
  } else {
    draft.description = description;
    draft.original_text = description || null;
  }
  if (caption.trim()) {
    draft.description = [caption.trim(), draft.description].filter(Boolean).join("\n\n");
    if (!draft.title) draft.title = caption.trim().split("\n")[0].slice(0, 80);
  }
  return draft;
}

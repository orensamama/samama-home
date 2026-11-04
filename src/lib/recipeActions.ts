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

function toRow(draft: RecipeDraft) {
  return {
    title: draft.title.trim() || "מתכון ללא שם",
    categories: draft.categories,
    servings: draft.servings,
    ingredients: draft.ingredients.map((line) => line.trim()).filter(Boolean),
    instructions: draft.instructions,
    tips: draft.tips,
    description: draft.description,
    source_url: draft.source_url,
    embed_url: draft.embed_url,
    image_url: draft.image_url,
    original_text: draft.original_text,
    ...(draft.is_favorite !== undefined ? { is_favorite: draft.is_favorite } : {}),
    updated_at: new Date().toISOString(),
  };
}

export async function insertRecipe(draft: RecipeDraft) {
  const { error } = await supabase.from("recipes").insert(toRow(draft));
  if (error) logSupabaseError("שמירת מתכון", error);
  return { error };
}

/** Saves the editor's whole draft over an existing recipe. */
export async function saveRecipeDraft(id: string, draft: RecipeDraft) {
  const { error } = await supabase.from("recipes").update(toRow(draft)).eq("id", id);
  if (error) logSupabaseError("עדכון מתכון", error);
  return { error };
}

/** Changes just some fields (favorite flag, a merge/replace from an import). */
export async function patchRecipe(id: string, patch: Partial<Recipe>) {
  const { error } = await supabase
    .from("recipes")
    .update({ ...patch, updated_at: new Date().toISOString() })
    .eq("id", id);
  if (error) logSupabaseError("עדכון מתכון", error);
  return { error };
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

"use client";

import { useMemo } from "react";
import { useSupabaseTable } from "@/lib/useSupabaseTable";
import { RECIPE_ORDER, TAG_ORDER, embedFromUrl, type Recipe, type RecipeTag } from "@/lib/recipeData";

// A table created by hand may carry the older column names (tags, notes, media_url).
type RawRecipe = Partial<Recipe> & { id: string; tags?: string[] | null; notes?: string | null; media_url?: string | null };

/** Rows come straight from Postgres: make sure arrays and text are always usable. */
function normalize(row: RawRecipe): Recipe {
  const categories = Array.isArray(row.categories) && row.categories.length > 0 ? row.categories : Array.isArray(row.tags) ? row.tags : [];
  const media = row.embed_url ?? row.source_url ?? row.media_url ?? null;
  return {
    id: row.id,
    title: row.title ?? "",
    categories,
    servings: row.servings === null || row.servings === undefined ? null : Number(row.servings),
    ingredients: Array.isArray(row.ingredients) ? row.ingredients.map(String) : [],
    instructions: row.instructions ?? "",
    tips: row.tips || row.notes || "",
    description: row.description ?? "",
    source_url: row.source_url ?? row.media_url ?? null,
    embed_url: row.embed_url ?? (media ? (embedFromUrl(media)?.embedUrl ?? null) : null),
    image_url: row.image_url ?? null,
    original_text: row.original_text ?? null,
    is_favorite: Boolean(row.is_favorite),
    created_at: row.created_at ?? "",
    updated_at: row.updated_at ?? "",
  };
}

/** The cookbook's recipes (newest first) and the family's own tag list. */
export function useRecipes() {
  const table = useSupabaseTable<RawRecipe>("recipes", "*", RECIPE_ORDER);
  const tagsTable = useSupabaseTable<RecipeTag>("recipe_tags", "*", TAG_ORDER);
  const recipes = useMemo(() => table.rows.map(normalize), [table.rows]);
  return {
    recipes,
    tags: tagsTable.rows,
    loading: table.loading,
    fetched: table.fetched,
    error: table.error,
    refetch: table.refetch,
    refetchTags: tagsTable.refetch,
  };
}

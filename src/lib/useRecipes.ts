"use client";

import { useMemo } from "react";
import { useSupabaseTable } from "@/lib/useSupabaseTable";
import { RECIPE_ORDER, TAG_ORDER, type Recipe, type RecipeTag } from "@/lib/recipeData";

type RawRecipe = Partial<Recipe> & { id: string };

/** Rows come straight from Postgres: make sure arrays and text are always usable. */
function normalize(row: RawRecipe): Recipe {
  return {
    id: row.id,
    title: row.title ?? "",
    categories: Array.isArray(row.categories) ? row.categories : [],
    servings: row.servings === null || row.servings === undefined ? null : Number(row.servings),
    ingredients: Array.isArray(row.ingredients) ? row.ingredients.map(String) : [],
    instructions: row.instructions ?? "",
    tips: row.tips ?? "",
    description: row.description ?? "",
    source_url: row.source_url ?? null,
    embed_url: row.embed_url ?? null,
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

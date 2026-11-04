"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { ArrowRight, ChefHat, Minus, Pencil, Plus, Star, Trash2, TriangleAlert, Users } from "lucide-react";
import { SkeletonBlock } from "@/components/Skeleton";
import ChefAssistant from "@/components/ChefAssistant";
import RecipeForm from "@/components/RecipeForm";
import VideoEmbed from "@/components/VideoEmbed";
import { useRecipes } from "@/lib/useRecipes";
import { addTag, deleteRecipe, patchRecipe, saveRecipeDraft } from "@/lib/recipeActions";
import { friendlyErrorMessage } from "@/lib/supabaseErrors";
import { collectTags, scaleIngredientLine, type RecipeDraft } from "@/lib/recipeData";

export default function RecipePage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const { recipes, tags, loading, fetched, refetch, refetchTags } = useRecipes();
  const recipe = useMemo(() => recipes.find((candidate) => candidate.id === id) ?? null, [recipes, id]);
  const allTags = useMemo(() => collectTags(tags, recipes), [tags, recipes]);

  const [portions, setPortions] = useState<number | null>(null);
  const [editing, setEditing] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [servingsDraft, setServingsDraft] = useState("");
  const [actionError, setActionError] = useState<string | null>(null);

  useEffect(() => {
    if (!confirmingDelete) return;
    const timeout = setTimeout(() => setConfirmingDelete(false), 3000);
    return () => clearTimeout(timeout);
  }, [confirmingDelete]);

  if (!recipe) {
    return (
      <div className="flex min-h-full flex-col p-4">
        <Link href="/recipes" className="mb-4 flex w-fit items-center gap-1 text-sm font-medium text-amber-600 dark:text-amber-400">
          <ArrowRight className="h-4 w-4" />
          לספר המתכונים
        </Link>
        {loading && !fetched ? (
          <SkeletonBlock className="h-64 w-full" />
        ) : (
          <p className="rounded-2xl border border-dashed border-amber-200 p-8 text-center text-sm text-stone-500 dark:border-amber-900/40">
            המתכון לא נמצא (ייתכן שנמחק).
          </p>
        )}
      </div>
    );
  }

  const base = recipe.servings && recipe.servings > 0 ? recipe.servings : null;
  const current = portions ?? base;
  const factor = base && current ? current / base : 1;
  const scaledLines = recipe.ingredients.map((line) => scaleIngredientLine(line, factor));

  async function handleCreateTag(name: string) {
    await addTag(name, tags.length + 1);
    refetchTags();
  }

  async function handleSave(draft: RecipeDraft) {
    setFormError(null);
    const { error } = await saveRecipeDraft(recipe!.id, draft);
    if (error) {
      setFormError(friendlyErrorMessage(error));
      return;
    }
    setPortions(null);
    refetch();
    setEditing(false);
  }

  async function handleDelete() {
    const { error } = await deleteRecipe(recipe!.id);
    if (error) {
      setActionError(friendlyErrorMessage(error));
      return;
    }
    router.push("/recipes");
  }

  async function toggleFavorite() {
    const { error } = await patchRecipe(recipe!.id, { is_favorite: !recipe!.is_favorite });
    if (error) setActionError(friendlyErrorMessage(error));
    else refetch();
  }

  async function saveServings() {
    const value = Number(servingsDraft);
    if (!(value > 0)) return;
    const { error } = await patchRecipe(recipe!.id, { servings: value });
    if (error) setActionError(friendlyErrorMessage(error));
    else {
      setServingsDraft("");
      refetch();
    }
  }

  const sectionTitle = "mb-2 text-sm font-bold text-stone-800 dark:text-stone-100";
  const card = "rounded-2xl border border-amber-100 bg-white p-4 shadow-sm dark:border-amber-950/30 dark:bg-stone-900";

  return (
    <div className="flex min-h-full flex-col">
      <header className="sticky top-0 z-10 flex items-center gap-2 border-b border-amber-100 bg-white/95 px-3 py-3 backdrop-blur dark:border-amber-950/40 dark:bg-stone-950/95">
        <Link href="/recipes" aria-label="חזרה לספר המתכונים" className="rounded-full p-2 text-stone-500 hover:bg-amber-50 dark:text-stone-400 dark:hover:bg-stone-800">
          <ArrowRight className="h-5 w-5" />
        </Link>
        <h1 className="min-w-0 flex-1 truncate text-lg font-bold text-stone-800 dark:text-stone-50">{recipe.title}</h1>
        <button
          type="button"
          onClick={toggleFavorite}
          aria-pressed={recipe.is_favorite}
          aria-label={recipe.is_favorite ? "הסרה ממועדפים" : "הוספה למועדפים"}
          className="rounded-full p-2 hover:bg-amber-50 dark:hover:bg-stone-800"
        >
          <Star className={`h-5 w-5 ${recipe.is_favorite ? "fill-amber-400 text-amber-500" : "text-stone-400"}`} />
        </button>
        <button
          type="button"
          onClick={() => {
            setFormError(null);
            setEditing(true);
          }}
          aria-label="עריכת המתכון"
          className="rounded-full p-2 text-stone-500 hover:bg-amber-50 dark:text-stone-400 dark:hover:bg-stone-800"
        >
          <Pencil className="h-5 w-5" />
        </button>
        {confirmingDelete ? (
          <button type="button" onClick={() => void handleDelete()} className="rounded-lg bg-red-500 px-2.5 py-1.5 text-xs font-semibold text-white hover:bg-red-600">
            לחצו שוב למחיקה
          </button>
        ) : (
          <button
            type="button"
            onClick={() => setConfirmingDelete(true)}
            aria-label="מחיקת המתכון"
            className="rounded-full p-2 text-stone-400 hover:bg-red-50 hover:text-red-500 dark:hover:bg-red-950/30"
          >
            <Trash2 className="h-5 w-5" />
          </button>
        )}
      </header>

      <div className="flex flex-col gap-4 p-4 pb-24">
        {actionError && <p className="rounded-xl bg-rose-50 px-3 py-2 text-xs text-rose-700 dark:bg-rose-950/30 dark:text-rose-300">{actionError}</p>}

        {recipe.categories.length > 0 && (
          <div className="flex flex-wrap gap-1.5">
            {recipe.categories.map((tag) => (
              <Link
                key={tag}
                href="/recipes"
                className="rounded-full bg-amber-100 px-3 py-1 text-xs font-medium text-amber-800 dark:bg-amber-950/40 dark:text-amber-300"
              >
                {tag}
              </Link>
            ))}
          </div>
        )}

        {recipe.embed_url ? (
          <VideoEmbed embedUrl={recipe.embed_url} sourceUrl={recipe.source_url} />
        ) : (
          <>
            {recipe.image_url ? (
              // eslint-disable-next-line @next/next/no-img-element -- user-uploaded / site image, arbitrary host
              <img src={recipe.image_url} alt={recipe.title} className="max-h-72 w-full rounded-2xl object-cover" />
            ) : null}
            {recipe.source_url && (
              <a href={recipe.source_url} target="_blank" rel="noopener noreferrer" dir="ltr" className="truncate text-xs font-medium text-amber-600 hover:underline dark:text-amber-400">
                {recipe.source_url}
              </a>
            )}
          </>
        )}

        {/* Ingredients with the portion scaler */}
        <section className={card}>
          <div className="mb-3 flex items-center justify-between gap-2">
            <h2 className="text-sm font-bold text-stone-800 dark:text-stone-100">מצרכים</h2>
            {base && current ? (
              <div className="flex items-center gap-1 rounded-full bg-amber-50 p-1 dark:bg-amber-950/30">
                <button
                  type="button"
                  onClick={() => setPortions(Math.max(1, current - 1))}
                  disabled={current <= 1}
                  aria-label="פחות מנות"
                  className="rounded-full bg-white p-1.5 text-amber-700 shadow-sm disabled:opacity-40 dark:bg-stone-800 dark:text-amber-400"
                >
                  <Minus className="h-3.5 w-3.5" />
                </button>
                <span className="flex min-w-[4.5rem] items-center justify-center gap-1 text-sm font-bold tabular-nums text-stone-800 dark:text-stone-100">
                  <Users className="h-3.5 w-3.5 text-amber-600" />
                  {current} מנות
                </span>
                <button
                  type="button"
                  onClick={() => setPortions(current + 1)}
                  aria-label="יותר מנות"
                  className="rounded-full bg-white p-1.5 text-amber-700 shadow-sm dark:bg-stone-800 dark:text-amber-400"
                >
                  <Plus className="h-3.5 w-3.5" />
                </button>
              </div>
            ) : (
              recipe.ingredients.length > 0 && (
                <form
                  onSubmit={(event) => {
                    event.preventDefault();
                    void saveServings();
                  }}
                  className="flex items-center gap-1"
                >
                  <input
                    type="number"
                    min="1"
                    inputMode="numeric"
                    value={servingsDraft}
                    onChange={(event) => setServingsDraft(event.target.value)}
                    placeholder="לכמה מנות?"
                    aria-label="לכמה מנות הכמויות כתובות"
                    className="w-24 rounded-lg border border-amber-200 bg-white px-2 py-1 text-xs text-stone-700 outline-none focus:border-amber-400 dark:border-amber-900/50 dark:bg-stone-950 dark:text-stone-200"
                  />
                  <button type="submit" disabled={!(Number(servingsDraft) > 0)} className="rounded-lg bg-amber-500 px-2 py-1 text-xs font-semibold text-white disabled:opacity-40">
                    התאמת כמויות
                  </button>
                </form>
              )
            )}
          </div>

          {base && factor !== 1 && (
            <p className="mb-2 rounded-lg bg-amber-50 px-3 py-1.5 text-xs text-amber-800 dark:bg-amber-950/20 dark:text-amber-300">
              הכמויות הותאמו מ-{base} ל-{current} מנות.{" "}
              <button type="button" onClick={() => setPortions(null)} className="font-semibold underline">
                חזרה למקור
              </button>
            </p>
          )}

          {recipe.ingredients.length === 0 ? (
            <p className="text-sm text-stone-400">לא נרשמו מצרכים. אפשר להוסיף בעריכה.</p>
          ) : (
            <ul className="divide-y divide-stone-100 dark:divide-stone-800">
              {scaledLines.map((line, index) => (
                <li key={`${index}-${recipe.ingredients[index]}`} className="flex items-start gap-2 py-2 text-sm text-stone-800 dark:text-stone-100">
                  <span className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-amber-400" />
                  <span className="flex-1">{line.text}</span>
                  {!line.scaled && (
                    <span title="כמות זו לא הותאמה אוטומטית" className="mt-0.5 shrink-0 text-amber-600">
                      <TriangleAlert className="h-3.5 w-3.5" aria-label="לא הותאם אוטומטית" />
                    </span>
                  )}
                </li>
              ))}
            </ul>
          )}
        </section>

        {recipe.instructions && (
          <section className={card}>
            <h2 className={sectionTitle}>אופן ההכנה</h2>
            <p className="whitespace-pre-wrap text-sm leading-relaxed text-stone-700 dark:text-stone-200">{recipe.instructions}</p>
          </section>
        )}

        {recipe.tips && (
          <section className="rounded-2xl border border-amber-200 bg-amber-50 p-4 dark:border-amber-900/40 dark:bg-amber-950/20">
            <h2 className={sectionTitle}>טיפים והערות</h2>
            <p className="whitespace-pre-wrap text-sm leading-relaxed text-stone-700 dark:text-stone-200">{recipe.tips}</p>
          </section>
        )}

        {recipe.description && (
          <details className={card}>
            <summary className="cursor-pointer text-sm font-bold text-stone-800 dark:text-stone-100">התיאור המקורי מהמקור</summary>
            <p className="mt-2 whitespace-pre-wrap text-sm leading-relaxed text-stone-600 dark:text-stone-300">{recipe.description}</p>
          </details>
        )}

        {recipe.original_text && recipe.original_text !== recipe.description && (
          <details className={card}>
            <summary className="cursor-pointer text-sm font-bold text-stone-800 dark:text-stone-100">הטקסט המקורי (כפי שהתקבל)</summary>
            <p className="mt-2 whitespace-pre-wrap text-xs leading-relaxed text-stone-500 dark:text-stone-400">{recipe.original_text}</p>
          </details>
        )}

        {recipe.ingredients.length === 0 && !recipe.instructions && !recipe.embed_url && !recipe.description && (
          <p className="flex items-center justify-center gap-2 text-sm text-stone-400">
            <ChefHat className="h-4 w-4" />
            המתכון עדיין ריק - לחצו על העיפרון כדי להשלים אותו.
          </p>
        )}
      </div>

      <ChefAssistant recipe={recipe} />

      {editing && (
        <RecipeForm
          heading="עריכת מתכון"
          initial={{
            title: recipe.title,
            categories: recipe.categories,
            servings: recipe.servings,
            ingredients: recipe.ingredients,
            instructions: recipe.instructions,
            tips: recipe.tips,
            description: recipe.description,
            source_url: recipe.source_url,
            embed_url: recipe.embed_url,
            image_url: recipe.image_url,
            original_text: recipe.original_text,
            is_favorite: recipe.is_favorite,
          }}
          allTags={allTags}
          error={formError}
          onDismissError={() => setFormError(null)}
          onCreateTag={handleCreateTag}
          onSave={handleSave}
          onClose={() => setEditing(false)}
        />
      )}
    </div>
  );
}

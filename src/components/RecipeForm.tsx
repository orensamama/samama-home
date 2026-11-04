"use client";

import { useState, type ChangeEvent, type FormEvent } from "react";
import { Camera, Image as ImageIcon, X } from "lucide-react";
import ErrorBanner from "@/components/ErrorBanner";
import RecipeTagPicker from "@/components/RecipeTagPicker";
import { uploadRecipeImage } from "@/lib/recipeActions";
import { embedFromUrl, type RecipeDraft } from "@/lib/recipeData";

const fieldClass =
  "w-full rounded-xl border border-amber-200 bg-white px-3 py-2 text-sm text-stone-700 outline-none focus:border-amber-400 dark:border-amber-900/50 dark:bg-stone-950 dark:text-stone-200";
const labelClass = "mb-1.5 block text-xs font-medium text-stone-500 dark:text-stone-400";

/**
 * Full editor for a recipe: every field can be changed at any time -- name,
 * quantities, method, tips, link, photo and any number of categories.
 */
export default function RecipeForm({
  heading,
  initial,
  allTags,
  error,
  notice,
  onDismissError,
  onCreateTag,
  onSave,
  onClose,
}: {
  heading: string;
  initial: RecipeDraft;
  allTags: string[];
  error?: string | null;
  /** A calm heads-up shown above the fields (e.g. "the page's text couldn't be read"). */
  notice?: string | null;
  onDismissError: () => void;
  onCreateTag?: (name: string) => void;
  onSave: (draft: RecipeDraft) => Promise<void>;
  onClose: () => void;
}) {
  const [title, setTitle] = useState(initial.title);
  const [categories, setCategories] = useState(initial.categories);
  const [servings, setServings] = useState(initial.servings === null ? "" : String(initial.servings));
  const [ingredients, setIngredients] = useState(initial.ingredients.join("\n"));
  const [instructions, setInstructions] = useState(initial.instructions);
  const [tips, setTips] = useState(initial.tips);
  const [description, setDescription] = useState(initial.description);
  const [sourceUrl, setSourceUrl] = useState(initial.source_url ?? "");
  const [imageUrl, setImageUrl] = useState(initial.image_url);
  const [uploading, setUploading] = useState(false);
  const [imageError, setImageError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  async function handleImage(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    setUploading(true);
    setImageError(null);
    const { url, error: uploadError } = await uploadRecipeImage(file);
    if (url) setImageUrl(url);
    else setImageError(uploadError);
    setUploading(false);
  }

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    if (saving) return;
    setSaving(true);
    const url = sourceUrl.trim();
    const parsedServings = Number(servings);
    await onSave({
      ...initial,
      title: title.trim(),
      categories,
      servings: servings.trim() !== "" && parsedServings > 0 ? parsedServings : null,
      ingredients: ingredients.split("\n").map((line) => line.trim()).filter(Boolean),
      instructions: instructions.trim(),
      tips: tips.trim(),
      description: description.trim(),
      source_url: url || null,
      // A new/changed link gets its player; an unchanged one keeps what was found for it.
      embed_url: url ? (embedFromUrl(url)?.embedUrl ?? (url === initial.source_url ? initial.embed_url : null)) : null,
      image_url: imageUrl,
    });
    setSaving(false);
  }

  const photoButton =
    "flex cursor-pointer items-center gap-2 rounded-xl border border-dashed border-amber-300 px-3 py-2 text-sm text-amber-700 transition-colors hover:bg-amber-50 dark:border-amber-800 dark:text-amber-400 dark:hover:bg-stone-800";

  return (
    <div className="fixed inset-0 z-[60] flex items-end justify-center bg-black/40 sm:items-center">
      <div className="flex max-h-[92dvh] w-full flex-col overflow-hidden rounded-t-3xl bg-white shadow-lg sm:max-w-lg sm:rounded-3xl dark:bg-stone-900">
        <div className="flex shrink-0 items-center justify-between border-b border-amber-100 p-4 dark:border-amber-950/30">
          <h2 className="text-lg font-bold text-stone-800 dark:text-stone-100">{heading}</h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="סגירה"
            className="rounded-full p-1.5 text-stone-400 hover:bg-stone-100 dark:hover:bg-stone-800"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="flex min-h-0 flex-1 flex-col">
          <div className="flex flex-1 flex-col gap-4 overflow-y-auto p-4">
            {error && <ErrorBanner message={error} onDismiss={onDismissError} />}
            {notice && (
              <p className="rounded-xl bg-amber-50 px-3 py-2 text-xs text-amber-800 dark:bg-amber-950/20 dark:text-amber-300">{notice}</p>
            )}

            <label>
              <span className={labelClass}>שם המתכון</span>
              <input
                type="text"
                value={title}
                onChange={(event) => setTitle(event.target.value)}
                placeholder="לדוגמה: עוגת שוקולד של סבתא"
                className={fieldClass}
              />
            </label>

            <div>
              <span className={labelClass}>קטגוריות ותגיות (אפשר כמה יחד)</span>
              <RecipeTagPicker allTags={allTags} selected={categories} onChange={setCategories} onCreate={onCreateTag} />
            </div>

            <div>
              <span className={labelClass}>תמונה</span>
              {imageUrl ? (
                <div className="relative w-fit">
                  {/* eslint-disable-next-line @next/next/no-img-element -- user-uploaded / site image, arbitrary host */}
                  <img src={imageUrl} alt="תמונת המתכון" className="h-28 w-28 rounded-xl border border-amber-200 object-cover dark:border-amber-900/50" />
                  <button
                    type="button"
                    onClick={() => setImageUrl(null)}
                    aria-label="הסרת תמונה"
                    className="absolute -right-2 -top-2 rounded-full bg-stone-800 p-1 text-white shadow"
                  >
                    <X className="h-3 w-3" />
                  </button>
                </div>
              ) : (
                <div className="flex flex-wrap gap-2">
                  <label className={photoButton}>
                    <Camera className="h-4 w-4" />
                    {uploading ? "מעלה..." : "צלם"}
                    <input type="file" accept="image/*" capture="environment" className="hidden" disabled={uploading} onChange={handleImage} />
                  </label>
                  <label className={photoButton}>
                    <ImageIcon className="h-4 w-4" />
                    מהגלריה
                    <input type="file" accept="image/*" className="hidden" disabled={uploading} onChange={handleImage} />
                  </label>
                </div>
              )}
              {imageError && <p className="mt-1 text-xs text-rose-600 dark:text-rose-400">{imageError}</p>}
            </div>

            <label>
              <span className={labelClass}>לכמה מנות הכמויות כתובות?</span>
              <input
                type="number"
                inputMode="numeric"
                min="1"
                value={servings}
                onChange={(event) => setServings(event.target.value)}
                placeholder="לדוגמה: 4 (מאפשר להתאים כמויות לפי מספר סועדים)"
                className={fieldClass}
              />
            </label>

            <label>
              <span className={labelClass}>מצרכים (שורה לכל מצרך, בדיוק כפי שכתוב)</span>
              <textarea
                value={ingredients}
                onChange={(event) => setIngredients(event.target.value)}
                rows={7}
                placeholder={"2 כוסות קמח\n3 ביצים\nחצי כפית מלח"}
                className={`${fieldClass} resize-y`}
              />
            </label>

            <label>
              <span className={labelClass}>אופן ההכנה</span>
              <textarea
                value={instructions}
                onChange={(event) => setInstructions(event.target.value)}
                rows={7}
                className={`${fieldClass} resize-y`}
              />
            </label>

            <label>
              <span className={labelClass}>טיפים והערות</span>
              <textarea value={tips} onChange={(event) => setTips(event.target.value)} rows={3} className={`${fieldClass} resize-y`} />
            </label>

            <label>
              <span className={labelClass}>קישור לסרטון / אתר (YouTube, Instagram, TikTok, אתר מתכונים)</span>
              <input
                type="url"
                dir="ltr"
                value={sourceUrl}
                onChange={(event) => setSourceUrl(event.target.value)}
                placeholder="https://..."
                className={fieldClass}
              />
            </label>

            {(description || initial.description) && (
              <label>
                <span className={labelClass}>תיאור מהמקור (הטקסט שצורף לסרטון / לאתר)</span>
                <textarea
                  value={description}
                  onChange={(event) => setDescription(event.target.value)}
                  rows={5}
                  className={`${fieldClass} resize-y`}
                />
              </label>
            )}
          </div>

          <div className="shrink-0 border-t border-amber-100 bg-white p-4 dark:border-amber-950/30 dark:bg-stone-900">
            <button
              type="submit"
              disabled={saving || uploading || (!title.trim() && !ingredients.trim() && !instructions.trim() && !sourceUrl.trim())}
              className="w-full rounded-xl bg-amber-500 px-4 py-3 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-amber-600 disabled:opacity-50"
            >
              {saving ? "שומר..." : "שמירת המתכון"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

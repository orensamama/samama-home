"use client";

import { useMemo, useState } from "react";
import { Sparkles, Trash2, X } from "lucide-react";
import { deleteRecipe, saveRecipeDraft } from "@/lib/recipeActions";
import {
  cleanTitle,
  planQuantityDuplicates,
  recipeToDraft,
  repairRecipe,
  suggestCategories,
  type Recipe,
  type RecipeDraft,
} from "@/lib/recipeData";

type Options = { titles: boolean; sections: boolean; duplicates: boolean; categories: boolean };

type Change = {
  recipe: Recipe;
  draft: RecipeDraft;
  titleBefore: string | null;
  sectionsChanged: boolean;
  categoriesAdded: string[];
};

type Failure = { title: string; message: string; code?: string };

/**
 * One-click tidy-up of every saved recipe: dish-name-only titles (the post text, view counts and
 * creator names move to the notes), ingredients and steps back in their own fields without
 * headings or emojis, the same dish saved for several batch sizes reduced to one, and
 * categories by keyword. Shows exactly what will change before anything is touched.
 */
export default function RecipeCleanupPanel({
  recipes,
  onDone,
  onClose,
}: {
  recipes: Recipe[];
  onDone: () => void;
  onClose: () => void;
}) {
  const [options, setOptions] = useState<Options>({ titles: true, sections: true, duplicates: true, categories: true });
  const [stage, setStage] = useState<"review" | "working" | "done">("review");
  const [progress, setProgress] = useState("");
  const [summary, setSummary] = useState<string[]>([]);
  const [failures, setFailures] = useState<Failure[]>([]);
  const [wipeText, setWipeText] = useState("");
  const [showTitles, setShowTitles] = useState(false);

  const plan = useMemo(() => {
    const groups = options.duplicates ? planQuantityDuplicates(recipes) : [];
    const removed = new Set(groups.flatMap((group) => group.remove.map((recipe) => recipe.id)));
    // The kept recipe also inherits the categories of the copies that go away.
    const inheritedCategories = new Map(groups.map((group) => [group.keep.id, group.remove.flatMap((recipe) => recipe.categories)]));

    const changes: Change[] = [];
    for (const recipe of recipes) {
      if (removed.has(recipe.id)) continue;
      const repaired = repairRecipe(recipe);
      const draft = recipeToDraft(recipe);
      let titleBefore: string | null = null;
      let sectionsChanged = false;

      if (options.titles && repaired.titleChanged) {
        titleBefore = recipe.title;
        draft.title = repaired.title;
        draft.description = repaired.description;
      }
      if (options.sections && repaired.sectionsChanged) {
        sectionsChanged = true;
        draft.ingredients = repaired.ingredients;
        draft.instructions = repaired.instructions;
        draft.tips = repaired.tips;
        draft.servings = repaired.servings;
        if (!options.titles) draft.description = repaired.description === recipe.description ? draft.description : repaired.description;
      }

      let categoriesAdded: string[] = [];
      const inherited = inheritedCategories.get(recipe.id) ?? [];
      const merged = Array.from(new Set([...draft.categories, ...inherited]));
      if (options.categories && recipe.categories.length === 0 && inherited.length === 0) {
        categoriesAdded = suggestCategories({ title: draft.title, ingredients: draft.ingredients });
      }
      const nextCategories = Array.from(new Set([...merged, ...categoriesAdded]));
      const categoriesChanged = nextCategories.join("|") !== recipe.categories.join("|");
      draft.categories = nextCategories;

      if (titleBefore !== null || sectionsChanged || categoriesChanged) {
        changes.push({ recipe, draft, titleBefore, sectionsChanged, categoriesAdded: categoriesChanged ? nextCategories.filter((c) => !recipe.categories.includes(c)) : [] });
      }
    }
    return { groups, changes };
  }, [recipes, options]);

  const titleChanges = plan.changes.filter((change) => change.titleBefore !== null);
  const sectionChanges = plan.changes.filter((change) => change.sectionsChanged);
  const categoryChanges = plan.changes.filter((change) => change.categoriesAdded.length > 0);
  const removeCount = plan.groups.reduce((sum, group) => sum + group.remove.length, 0);
  const nothingToDo = plan.changes.length === 0 && removeCount === 0;

  async function run() {
    setStage("working");
    const failed: Failure[] = [];
    let saved = 0;
    let deleted = 0;
    let step = 0;
    const total = plan.changes.length + removeCount;

    for (const change of plan.changes) {
      setProgress(`מנקה ${++step} מתוך ${total}...`);
      const { error } = await saveRecipeDraft(change.recipe.id, change.draft);
      if (error) failed.push({ title: change.draft.title, message: error.message, code: error.code });
      else saved++;
    }
    for (const group of plan.groups) {
      for (const recipe of group.remove) {
        setProgress(`מנקה ${++step} מתוך ${total}...`);
        const { error } = await deleteRecipe(recipe.id);
        if (error) failed.push({ title: recipe.title, message: error.message, code: error.code });
        else deleted++;
      }
    }

    const lines = [`עודכנו ${saved} מתכונים`];
    if (deleted > 0) lines.push(`נמחקו ${deleted} כפילויות של כמויות (נשמר מתכון אחד מכל קבוצה)`);
    setSummary(lines);
    setFailures(failed);
    setStage("done");
    onDone();
  }

  async function wipeAll() {
    if (wipeText.trim() !== "מחק") return;
    setStage("working");
    const failed: Failure[] = [];
    let deleted = 0;
    for (const recipe of recipes) {
      setProgress(`מוחק ${deleted + failed.length + 1} מתוך ${recipes.length}...`);
      const { error } = await deleteRecipe(recipe.id);
      if (error) failed.push({ title: recipe.title, message: error.message, code: error.code });
      else deleted++;
    }
    setSummary([`נמחקו ${deleted} מתכונים. עכשיו אפשר לייבא מחדש את קובץ הצ'אט עם הניתוח המעודכן.`]);
    setFailures(failed);
    setStage("done");
    onDone();
  }

  const checkbox = (key: keyof Options, label: string, count: number) => (
    <label className="flex cursor-pointer items-center gap-2 text-sm text-stone-700 dark:text-stone-200">
      <input type="checkbox" checked={options[key]} onChange={(event) => setOptions((current) => ({ ...current, [key]: event.target.checked }))} />
      <span className="flex-1">{label}</span>
      <span className="rounded-full bg-amber-100 px-2 py-0.5 text-xs font-semibold tabular-nums text-amber-800 dark:bg-amber-950/40 dark:text-amber-300">{count}</span>
    </label>
  );

  return (
    <div className="fixed inset-0 z-[60] flex items-end justify-center bg-black/40 sm:items-center">
      <div className="flex max-h-[92dvh] w-full flex-col overflow-hidden rounded-t-3xl bg-white shadow-lg sm:max-w-xl sm:rounded-3xl dark:bg-stone-900">
        <div className="flex shrink-0 items-center justify-between border-b border-amber-100 p-4 dark:border-amber-950/30">
          <h2 className="flex items-center gap-2 text-lg font-bold text-stone-800 dark:text-stone-100">
            <Sparkles className="h-5 w-5 text-amber-500" />
            ניקוי וארגון מחדש
          </h2>
          <button type="button" onClick={onClose} aria-label="סגירה" className="rounded-full p-1.5 text-stone-400 hover:bg-stone-100 dark:hover:bg-stone-800">
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="flex flex-1 flex-col gap-4 overflow-y-auto p-4">
          {stage === "review" && (
            <>
              <p className="text-sm text-stone-600 dark:text-stone-300">
                עוברים על כל {recipes.length} המתכונים ומסדרים אותם. כלום לא משתנה עד שלוחצים &quot;בצע&quot; - למטה רואים בדיוק מה ישתנה.
              </p>

              <div className="flex flex-col gap-2 rounded-xl border border-amber-100 p-3 dark:border-amber-950/30">
                {checkbox("titles", "כותרות: שם המנה בלבד (בלי צפיות, יוצרים, ציטוטים - הם עוברים להערות)", titleChanges.length)}
                {checkbox("sections", "מצרכים והכנה: כל שורה בשדה שלה, בלי כותרות ואימוג'ים כפולים", sectionChanges.length)}
                {checkbox("duplicates", "איחוד כפילויות של כמויות (למשל 500 גרם / 1 ק\"ג / 1.5 ק\"ג) - נשאר מתכון אחד, והאחרים נמחקים", removeCount)}
                {checkbox("categories", "שיוך אוטומטי לקטגוריות לפי מילות מפתח (רק למתכונים בלי קטגוריה)", categoryChanges.length)}
              </div>

              {titleChanges.length > 0 && (
                <div>
                  <button type="button" onClick={() => setShowTitles((value) => !value)} className="text-xs font-medium text-amber-700 hover:underline dark:text-amber-400">
                    {showTitles ? "הסתר" : "הצג"} את שינויי הכותרות
                  </button>
                  {showTitles && (
                    <ul className="mt-2 flex max-h-48 flex-col gap-1.5 overflow-y-auto">
                      {titleChanges.map((change) => (
                        <li key={change.recipe.id} className="rounded-lg bg-stone-50 p-2 text-xs dark:bg-stone-800/50">
                          <p className="text-stone-400 line-through">{change.titleBefore}</p>
                          <p className="font-semibold text-stone-800 dark:text-stone-100">{change.draft.title}</p>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              )}

              {plan.groups.length > 0 && (
                <ul className="flex flex-col gap-1.5 rounded-xl bg-rose-50 p-3 text-xs dark:bg-rose-950/20">
                  <li className="font-semibold text-rose-700 dark:text-rose-300">כפילויות שיאוחדו:</li>
                  {plan.groups.map((group) => (
                    <li key={group.keep.id} className="text-stone-700 dark:text-stone-200">
                      נשמר: <strong>{cleanTitle(group.keep.title)}</strong> · יימחקו {group.remove.length} עותקים נוספים
                    </li>
                  ))}
                </ul>
              )}

              {nothingToDo && <p className="rounded-xl bg-emerald-50 p-3 text-sm text-emerald-800 dark:bg-emerald-950/20 dark:text-emerald-300">✓ הכול כבר נקי - אין מה לשנות.</p>}

              <details className="rounded-xl border border-dashed border-rose-200 p-3 text-xs dark:border-rose-900/50">
                <summary className="cursor-pointer font-medium text-rose-600 dark:text-rose-400">מחיקת כל המתכונים וייבוא מחדש מקובץ הצ&apos;אט</summary>
                <p className="mt-2 text-stone-600 dark:text-stone-300">
                  מוחק את כל {recipes.length} המתכונים (אי אפשר לשחזר) כדי לייבא את הקובץ מחדש עם הניתוח המעודכן. הקלידו &quot;מחק&quot; לאישור.
                </p>
                <div className="mt-2 flex gap-2">
                  <input
                    type="text"
                    value={wipeText}
                    onChange={(event) => setWipeText(event.target.value)}
                    placeholder="מחק"
                    aria-label="הקלידו מחק לאישור"
                    className="w-24 rounded-lg border border-rose-200 bg-white px-2 py-1.5 text-sm outline-none focus:border-rose-400 dark:border-rose-900/50 dark:bg-stone-950"
                  />
                  <button
                    type="button"
                    onClick={() => void wipeAll()}
                    disabled={wipeText.trim() !== "מחק" || recipes.length === 0}
                    className="flex items-center gap-1 rounded-lg bg-rose-500 px-3 py-1.5 text-xs font-semibold text-white hover:bg-rose-600 disabled:opacity-40"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                    מחק הכול
                  </button>
                </div>
              </details>
            </>
          )}

          {stage === "working" && <p className="py-8 text-center text-sm text-stone-600 dark:text-stone-300">{progress || "עובד..."}</p>}

          {stage === "done" && (
            <>
              <ul className="flex flex-col gap-1 py-2 text-sm text-stone-700 dark:text-stone-200">
                {summary.map((line) => (
                  <li key={line}>✓ {line}</li>
                ))}
              </ul>
              {failures.length > 0 && (
                <div className="rounded-xl border border-rose-200 bg-rose-50 p-3 text-xs dark:border-rose-900/50 dark:bg-rose-950/20">
                  <p className="mb-1 font-bold text-rose-700 dark:text-rose-300">✗ {failures.length} פעולות נכשלו:</p>
                  <ul className="flex max-h-40 flex-col gap-1 overflow-y-auto">
                    {failures.map((failure, index) => (
                      <li key={`${index}-${failure.title}`} dir="ltr" className="text-rose-700 dark:text-rose-300">
                        {failure.title}: {failure.code ? `[${failure.code}] ` : ""}
                        {failure.message}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </>
          )}
        </div>

        <div className="shrink-0 border-t border-amber-100 bg-white p-4 dark:border-amber-950/30 dark:bg-stone-900">
          {stage === "review" ? (
            <button
              type="button"
              onClick={() => void run()}
              disabled={nothingToDo}
              className="w-full rounded-xl bg-amber-500 px-4 py-3 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-amber-600 disabled:opacity-50"
            >
              בצע ניקוי ({plan.changes.length} עדכונים{removeCount > 0 ? `, ${removeCount} מחיקות` : ""})
            </button>
          ) : stage === "done" ? (
            <button type="button" onClick={onClose} className="w-full rounded-xl bg-amber-500 px-4 py-3 text-sm font-semibold text-white hover:bg-amber-600">
              סגירה
            </button>
          ) : null}
        </div>
      </div>
    </div>
  );
}

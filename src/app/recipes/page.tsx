"use client";

import { useCallback, useMemo, useState } from "react";
import Link from "next/link";
import { ChefHat, FileUp, Plus, Refrigerator, Search, Sparkles, Star, Tags, TriangleAlert, Video } from "lucide-react";
import PageHeader from "@/components/PageHeader";
import { SkeletonList } from "@/components/Skeleton";
import SetupSqlButton from "@/components/SetupSqlButton";
import RecipeAddModal from "@/components/RecipeAddModal";
import RecipeCleanupPanel from "@/components/RecipeCleanupPanel";
import RecipeForm from "@/components/RecipeForm";
import RecipeImportPanel from "@/components/RecipeImportPanel";
import RecipeTagManager from "@/components/RecipeTagManager";
import { useRecipes } from "@/lib/useRecipes";
import { addTag, deleteTag, insertRecipe, patchRecipe, renameTag } from "@/lib/recipeActions";
import { friendlyErrorMessage } from "@/lib/supabaseErrors";
import {
  collectTags,
  emojiForTag,
  emptyDraft,
  findDuplicate,
  mergeIntoExisting,
  replaceWithNewer,
  reviewDraft,
  searchRecipes,
  tagColorClasses,
  type DuplicateMatch,
  type RecipeDraft,
  type ReviewItem,
} from "@/lib/recipeData";

type Modal = "add" | "form" | "import" | "tags" | "cleanup" | null;

/** What the category cards have selected: favourites, one category, the uncategorised ones, or everything. */
type View = { kind: "favorites" } | { kind: "tag"; name: string } | { kind: "uncategorized" } | { kind: "all" } | null;

export default function RecipesPage() {
  const { recipes, tags, loading, fetched, error, refetch, refetchTags } = useRecipes();

  const [text, setText] = useState("");
  const [haveMode, setHaveMode] = useState(false);
  const [have, setHave] = useState("");
  const [view, setView] = useState<View>(null);

  const [modal, setModal] = useState<Modal>(null);
  const [draft, setDraft] = useState<RecipeDraft>(emptyDraft());
  const [notice, setNotice] = useState<string | null>(null);
  const [reviewItems, setReviewItems] = useState<ReviewItem[] | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [dupPrompt, setDupPrompt] = useState<{ draft: RecipeDraft; match: DuplicateMatch } | null>(null);
  const [pageError, setPageError] = useState<string | null>(null);

  // Tags added this session show up at once, even before (or without) the database confirming them.
  const [extraTags, setExtraTags] = useState<string[]>([]);
  const [tagError, setTagError] = useState<{ message: string; needsSql: boolean } | null>(null);
  const allTags = useMemo(() => {
    const base = collectTags(tags, recipes);
    return [...base, ...extraTags.filter((name) => !base.includes(name))];
  }, [tags, recipes, extraTags]);
  const tagCounts = useMemo(() => {
    const counts = new Map<string, number>();
    for (const recipe of recipes) for (const tag of recipe.categories) counts.set(tag, (counts.get(tag) ?? 0) + 1);
    return counts;
  }, [recipes]);

  const favoriteCount = useMemo(() => recipes.filter((recipe) => recipe.is_favorite).length, [recipes]);
  const uncategorizedCount = useMemo(() => recipes.filter((recipe) => recipe.categories.length === 0).length, [recipes]);

  // A recipe in several categories shows up under each of them (the filter is "carries this tag").
  const matches = useMemo(
    () =>
      searchRecipes(recipes, { text, tags: view?.kind === "tag" ? [view.name] : [], have: haveMode ? have : "" }).filter(({ recipe }) =>
        view?.kind === "favorites" ? recipe.is_favorite : view?.kind === "uncategorized" ? recipe.categories.length === 0 : true
      ),
    [recipes, text, view, haveMode, have]
  );
  const searching = text.trim() !== "" || (haveMode && have.trim() !== "");
  const showList = view !== null || searching;
  const listTitle = searching
    ? "תוצאות חיפוש"
    : view?.kind === "favorites"
      ? "⭐ מועדפים"
      : view?.kind === "tag"
        ? `${emojiForTag(view.name)} ${view.name}`
        : view?.kind === "uncategorized"
          ? "📂 ללא קטגוריה"
          : "📖 כל המתכונים";

  // Tapping the selected card again closes it.
  function pickView(next: NonNullable<View>) {
    setView((current) => {
      if (current?.kind !== next.kind) return next;
      return current.kind === "tag" && next.kind === "tag" && current.name !== next.name ? next : null;
    });
  }

  const handleCreateTag = useCallback(
    async (nameRaw: string) => {
      const name = nameRaw.trim();
      if (!name) return;
      setTagError(null);
      setExtraTags((current) => (current.includes(name) ? current : [...current, name]));
      const { error: addError } = await addTag(name, tags.length + 1);
      if (addError && addError.code !== "23505") {
        const missingTable = addError.code === "42P01" || addError.code === "PGRST205";
        setTagError({
          message: missingTable
            ? "התגית נוספה לשימוש כעת, אבל טבלת התגיות לא קיימת במסד הנתונים ולכן היא לא תישמר. הריצו פעם אחת את ה-SQL שמתחת."
            : `התגית נוספה לשימוש כעת, אבל לא נשמרה במסד הנתונים: ${addError.message}`,
          needsSql: missingTable,
        });
      }
      refetchTags();
    },
    [tags.length, refetchTags]
  );

  // `review` = a freshly pasted/imported recipe: the form opens as a review stage (nothing saved yet).
  function openForm(next: RecipeDraft, nextNotice: string | null = null, review: ReviewItem[] | null = null) {
    setDraft(next);
    setNotice(nextNotice);
    setReviewItems(review);
    setFormError(null);
    setModal("form");
  }

  async function saveNew(next: RecipeDraft) {
    const { error: saveError } = await insertRecipe(next);
    if (saveError) {
      setFormError(friendlyErrorMessage(saveError));
      return false;
    }
    refetch();
    return true;
  }

  async function handleSave(next: RecipeDraft) {
    setFormError(null);
    const match = findDuplicate(next, recipes);
    if (match) {
      setDupPrompt({ draft: next, match });
      return;
    }
    if (await saveNew(next)) setModal(null);
  }

  async function resolveDuplicate(choice: "merge" | "replace" | "new") {
    if (!dupPrompt) return;
    const { draft: incoming, match } = dupPrompt;
    let failed = false;
    if (choice === "new") failed = !(await saveNew(incoming));
    else {
      const patch = choice === "merge" ? mergeIntoExisting(match.existing, incoming) : replaceWithNewer(match.existing, incoming);
      const { error: patchError } = await patchRecipe(match.existing.id, patch);
      if (patchError) {
        setFormError(friendlyErrorMessage(patchError));
        failed = true;
      } else refetch();
    }
    setDupPrompt(null);
    if (!failed) setModal(null);
  }

  async function handleRenameTag(oldName: string, newName: string) {
    const { error: renameError } = await renameTag(oldName, newName, tags, recipes);
    if (renameError) setPageError(friendlyErrorMessage(renameError));
    setView((current) => (current?.kind === "tag" && current.name === oldName ? { kind: "tag", name: newName } : current));
    refetchTags();
    refetch();
  }

  async function handleDeleteTag(name: string) {
    const { error: deleteError } = await deleteTag(name, tags, recipes);
    if (deleteError) setPageError(friendlyErrorMessage(deleteError));
    setView((current) => (current?.kind === "tag" && current.name === name ? null : current));
    refetchTags();
    refetch();
  }

  const chipBase = "shrink-0 rounded-full border px-3 py-1 text-xs font-medium transition-colors";

  return (
    <div className="flex min-h-full flex-col">
      <PageHeader title="ספר המתכונים המשפחתי" subtitle={recipes.length > 0 ? `${recipes.length} מתכונים` : "המתכונים של בית סממה"} />

      <div className="flex flex-col gap-3 p-4 pb-28">
        {error && (
          <div className="flex flex-col gap-2 rounded-2xl border border-amber-300 bg-amber-50 p-4 dark:border-amber-800 dark:bg-amber-950/20">
            <p className="flex items-center gap-2 text-sm font-bold text-stone-800 dark:text-stone-100">
              <TriangleAlert className="h-5 w-5 shrink-0 text-amber-600" />
              ספר המתכונים דורש הגדרה חד־פעמית במסד הנתונים
            </p>
            <p className="text-xs text-stone-600 dark:text-stone-300">
              לחצו &quot;העתק SQL&quot;, ב-Supabase: SQL Editor ← New query ← הדביקו ← Run (בטוח להרצה, לא מוחק כלום), וחזרו לכאן.
            </p>
            <SetupSqlButton />
          </div>
        )}
        {pageError && (
          <p className="rounded-xl bg-rose-50 px-3 py-2 text-xs text-rose-700 dark:bg-rose-950/30 dark:text-rose-300">
            {pageError}{" "}
            <button type="button" onClick={() => setPageError(null)} className="font-semibold underline">
              סגירה
            </button>
          </p>
        )}

        {/* Search */}
        <div className="relative">
          <Search className="pointer-events-none absolute start-3 top-1/2 h-4 w-4 -translate-y-1/2 text-stone-400" />
          <input
            type="search"
            value={text}
            onChange={(event) => setText(event.target.value)}
            placeholder="חיפוש לפי שם מתכון, מצרך או תגית..."
            aria-label="חיפוש מתכונים"
            className="w-full rounded-xl border border-amber-200 bg-white py-2.5 pe-3 ps-9 text-sm text-stone-700 outline-none focus:border-amber-400 dark:border-amber-900/50 dark:bg-stone-900 dark:text-stone-200"
          />
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => setHaveMode((value) => !value)}
            aria-pressed={haveMode}
            className={`${chipBase} flex items-center gap-1 ${
              haveMode ? "border-sky-500 bg-sky-500 text-white" : "border-sky-200 bg-sky-50 text-sky-700 dark:border-sky-900/50 dark:bg-sky-950/30 dark:text-sky-300"
            }`}
          >
            <Refrigerator className="h-3.5 w-3.5" />
            מה יש לי בבית?
          </button>
          <button
            type="button"
            onClick={() => setModal("tags")}
            className={`${chipBase} flex items-center gap-1 border-stone-200 bg-white text-stone-600 hover:bg-stone-50 dark:border-stone-700 dark:bg-stone-900 dark:text-stone-300`}
          >
            <Tags className="h-3.5 w-3.5" />
            ניהול קטגוריות
          </button>
          <button
            type="button"
            onClick={() => setModal("import")}
            className={`${chipBase} flex items-center gap-1 border-stone-200 bg-white text-stone-600 hover:bg-stone-50 dark:border-stone-700 dark:bg-stone-900 dark:text-stone-300`}
          >
            <FileUp className="h-3.5 w-3.5" />
            ייבוא מוואטסאפ
          </button>
          {recipes.length > 0 && (
            <button
              type="button"
              onClick={() => setModal("cleanup")}
              className={`${chipBase} flex items-center gap-1 border-amber-300 bg-amber-50 text-amber-800 hover:bg-amber-100 dark:border-amber-800 dark:bg-amber-950/30 dark:text-amber-300`}
            >
              <Sparkles className="h-3.5 w-3.5" />
              ניקוי וארגון מחדש
            </button>
          )}
        </div>

        {haveMode && (
          <div className="flex flex-col gap-1 rounded-xl border border-sky-200 bg-sky-50 p-2.5 dark:border-sky-900/50 dark:bg-sky-950/20">
            <input
              type="text"
              value={have}
              onChange={(event) => setHave(event.target.value)}
              placeholder="מצרכים שיש בבית, מופרדים בפסיק: ביצים, עגבניות, בצל"
              aria-label="מצרכים שיש בבית"
              className="w-full rounded-lg border border-sky-200 bg-white px-3 py-2 text-sm text-stone-700 outline-none focus:border-sky-400 dark:border-sky-900/50 dark:bg-stone-950 dark:text-stone-200"
            />
            <p className="text-[11px] text-sky-700 dark:text-sky-300">המתכונים ממוינים לפי כמה מהמצרכים כבר יש לכם.</p>
          </div>
        )}

        {/* Category cards only: the recipes of a category show once it's picked */}
        {recipes.length > 0 && (
          <div className="grid grid-cols-3 gap-2 sm:grid-cols-4" role="group" aria-label="קטגוריות">
            <button
              type="button"
              aria-pressed={view?.kind === "favorites"}
              onClick={() => pickView({ kind: "favorites" })}
              className={`col-span-3 flex items-center gap-3 rounded-2xl border px-4 py-3 text-right transition-all active:scale-[0.98] sm:col-span-4 ${
                view?.kind === "favorites"
                  ? "border-amber-500 bg-gradient-to-l from-amber-500 to-orange-500 text-white shadow-md"
                  : "border-amber-300 bg-gradient-to-l from-amber-100 to-orange-50 text-amber-900 hover:shadow-sm dark:border-amber-800 dark:from-amber-950/50 dark:to-orange-950/20 dark:text-amber-200"
              }`}
            >
              <span className="text-3xl leading-none" aria-hidden="true">
                ⭐
              </span>
              <span className="flex-1 text-base font-bold">מועדפים</span>
              <span className={`rounded-full px-2.5 py-0.5 text-sm font-bold tabular-nums ${view?.kind === "favorites" ? "bg-white/25" : "bg-white/70 dark:bg-stone-900/50"}`}>{favoriteCount}</span>
            </button>

            {allTags.map((tag) => {
              const on = view?.kind === "tag" && view.name === tag;
              return (
                <button
                  key={tag}
                  type="button"
                  aria-pressed={on}
                  onClick={() => pickView({ kind: "tag", name: tag })}
                  className={`flex flex-col items-center gap-0.5 rounded-2xl border px-1.5 py-2.5 text-center transition-all active:scale-95 ${
                    on ? "border-amber-500 bg-amber-500 text-white shadow-md" : `${tagColorClasses(tag)} hover:shadow-sm`
                  }`}
                >
                  <span className="text-2xl leading-none" aria-hidden="true">
                    {emojiForTag(tag)}
                  </span>
                  <span className="line-clamp-2 text-[11px] font-semibold leading-tight">{tag}</span>
                  <span className={`text-[10px] tabular-nums ${on ? "text-white/80" : "opacity-60"}`}>{tagCounts.get(tag) ?? 0}</span>
                </button>
              );
            })}

            {uncategorizedCount > 0 && (
              <button
                type="button"
                aria-pressed={view?.kind === "uncategorized"}
                onClick={() => pickView({ kind: "uncategorized" })}
                className={`flex flex-col items-center gap-0.5 rounded-2xl border px-1.5 py-2.5 text-center transition-all active:scale-95 ${
                  view?.kind === "uncategorized" ? "border-amber-500 bg-amber-500 text-white shadow-md" : "border-stone-200 bg-stone-50 text-stone-600 dark:border-stone-700 dark:bg-stone-900 dark:text-stone-300"
                }`}
              >
                <span className="text-2xl leading-none" aria-hidden="true">
                  📂
                </span>
                <span className="text-[11px] font-semibold leading-tight">ללא קטגוריה</span>
                <span className="text-[10px] tabular-nums opacity-60">{uncategorizedCount}</span>
              </button>
            )}
            <button
              type="button"
              aria-pressed={view?.kind === "all"}
              onClick={() => pickView({ kind: "all" })}
              className={`flex flex-col items-center gap-0.5 rounded-2xl border px-1.5 py-2.5 text-center transition-all active:scale-95 ${
                view?.kind === "all" ? "border-amber-500 bg-amber-500 text-white shadow-md" : "border-stone-200 bg-stone-50 text-stone-600 dark:border-stone-700 dark:bg-stone-900 dark:text-stone-300"
              }`}
            >
              <span className="text-2xl leading-none" aria-hidden="true">
                📖
              </span>
              <span className="text-[11px] font-semibold leading-tight">כל המתכונים</span>
              <span className="text-[10px] tabular-nums opacity-60">{recipes.length}</span>
            </button>
          </div>
        )}

        {/* List: only for a picked category / search */}
        {loading && recipes.length === 0 ? (
          <SkeletonList count={4} itemClassName="h-24" />
        ) : fetched && recipes.length === 0 && !error ? (
          <div className="flex flex-col items-center gap-3 rounded-2xl border border-dashed border-amber-200 p-8 text-center dark:border-amber-900/40">
            <ChefHat className="h-10 w-10 text-amber-400" />
            <p className="text-sm font-semibold text-stone-700 dark:text-stone-200">ספר המתכונים עדיין ריק</p>
            <p className="text-xs text-stone-500 dark:text-stone-400">הדביקו מתכון או קישור, הקלידו בקול, צלמו עמוד, או ייבאו מצ&apos;אט וואטסאפ.</p>
            <button type="button" onClick={() => setModal("add")} className="rounded-xl bg-amber-500 px-4 py-2 text-sm font-semibold text-white hover:bg-amber-600">
              הוספת המתכון הראשון
            </button>
          </div>
        ) : !showList ? (
          recipes.length > 0 && <p className="text-center text-xs text-stone-400 dark:text-stone-500">בחרו קטגוריה כדי לראות את המתכונים שלה, או חפשו למעלה.</p>
        ) : (
          <div className="flex flex-col gap-2.5">
            <div className="flex items-center justify-between gap-2">
              <h2 className="text-sm font-bold text-stone-700 dark:text-stone-200">
                {listTitle} <span className="font-normal text-stone-400">({matches.length})</span>
              </h2>
              {view && (
                <button type="button" onClick={() => setView(null)} className="text-xs font-medium text-amber-600 hover:underline dark:text-amber-400">
                  חזרה לקטגוריות
                </button>
              )}
            </div>

            {matches.length === 0 ? (
              <p className="rounded-2xl border border-dashed border-amber-200 p-6 text-center text-sm text-stone-400 dark:border-amber-900/40">
                {view?.kind === "favorites" ? "עדיין לא סימנתם מתכונים מועדפים - פתחו מתכון ולחצו על הכוכב." : "לא נמצאו מתכונים שמתאימים"}
              </p>
            ) : (
              <ul className="flex flex-col gap-2.5">
                {matches.map(({ recipe, haveCount, total }) => (
                  <li key={recipe.id}>
                    <Link
                      href={`/recipes/${recipe.id}`}
                      className="flex max-h-28 gap-3 overflow-hidden rounded-2xl border border-amber-100 bg-white p-3 shadow-sm transition-shadow hover:shadow-md dark:border-amber-950/30 dark:bg-stone-900"
                    >
                      <span className="flex h-20 w-20 shrink-0 items-center justify-center overflow-hidden rounded-xl bg-amber-50 dark:bg-amber-950/30">
                        {recipe.image_url ? (
                          // eslint-disable-next-line @next/next/no-img-element -- user-uploaded / site image, arbitrary host
                          <img src={recipe.image_url} alt="" loading="lazy" className="h-full w-full object-cover" />
                        ) : (
                          <ChefHat className="h-8 w-8 text-amber-300" />
                        )}
                      </span>
                      <span className="flex min-w-0 flex-1 flex-col gap-1">
                        <span className="flex items-start gap-1.5">
                          <span className="line-clamp-2 min-w-0 flex-1 text-sm font-bold leading-snug text-stone-800 dark:text-stone-100">{recipe.title}</span>
                          {recipe.is_favorite && <Star className="h-4 w-4 shrink-0 fill-amber-400 text-amber-500" />}
                        </span>
                        {recipe.categories.length > 0 && (
                          <span className="flex flex-wrap gap-1">
                            {recipe.categories.slice(0, 3).map((tag) => (
                              <span key={tag} className={`rounded-full border px-2 py-0.5 text-[10px] font-medium ${tagColorClasses(tag)}`}>
                                {emojiForTag(tag)} {tag}
                              </span>
                            ))}
                            {recipe.categories.length > 3 && <span className="text-[10px] text-stone-400">+{recipe.categories.length - 3}</span>}
                          </span>
                        )}
                        <span className="mt-auto flex items-center gap-2 text-[11px] text-stone-400 dark:text-stone-500">
                          {recipe.ingredients.length > 0 && <span>{recipe.ingredients.length} מצרכים</span>}
                          {recipe.embed_url && (
                            <span className="flex items-center gap-0.5 text-sky-500">
                              <Video className="h-3 w-3" />
                              סרטון
                            </span>
                          )}
                          {haveMode && have.trim() && (
                            <span className="rounded-full bg-sky-100 px-2 py-0.5 font-semibold text-sky-700 dark:bg-sky-950/40 dark:text-sky-300">
                              יש לך {haveCount} מתוך {total}
                            </span>
                          )}
                        </span>
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}
      </div>

      <button
        type="button"
        onClick={() => setModal("add")}
        aria-label="הוספת מתכון"
        className="fixed bottom-20 left-4 z-40 flex items-center gap-1 rounded-full bg-amber-500 px-4 py-2.5 text-sm font-semibold text-white shadow-lg transition-colors hover:bg-amber-600 active:scale-95"
      >
        <Plus className="h-4 w-4" />
        מתכון
      </button>

      {modal === "add" && (
        <RecipeAddModal
          onDraft={(next, nextNotice) => openForm(next, nextNotice, reviewDraft(next))}
          onImportChat={() => setModal("import")}
          onManual={() => openForm(emptyDraft())}
          onClose={() => setModal(null)}
        />
      )}

      {modal === "form" && (
        <RecipeForm
          heading={reviewItems ? "סקירת מתכון חדש" : "מתכון חדש"}
          initial={draft}
          allTags={allTags}
          error={formError}
          notice={notice}
          reviewItems={reviewItems}
          onDismissError={() => setFormError(null)}
          onCreateTag={handleCreateTag}
          onSave={handleSave}
          onClose={() => setModal(null)}
        />
      )}

      {modal === "import" && (
        <RecipeImportPanel
          recipes={recipes}
          allTags={allTags}
          onCreateTag={handleCreateTag}
          onDone={() => {
            refetch();
            refetchTags();
          }}
          onClose={() => setModal(null)}
        />
      )}

      {modal === "tags" && (
        <RecipeTagManager
          tags={allTags}
          counts={tagCounts}
          error={tagError}
          onAdd={handleCreateTag}
          onRename={handleRenameTag}
          onDelete={handleDeleteTag}
          onClose={() => setModal(null)}
        />
      )}

      {modal === "cleanup" && (
        <RecipeCleanupPanel
          recipes={recipes}
          onDone={() => {
            refetch();
            refetchTags();
          }}
          onClose={() => setModal(null)}
        />
      )}

      {dupPrompt && (
        <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/50 p-4">
          <div className="flex w-full max-w-sm flex-col gap-3 rounded-2xl bg-white p-5 shadow-xl dark:bg-stone-900">
            <h3 className="text-base font-bold text-stone-800 dark:text-stone-100">כבר יש מתכון דומה</h3>
            <p className="text-sm text-stone-600 dark:text-stone-300">
              &quot;{dupPrompt.match.existing.title}&quot; —{" "}
              {dupPrompt.match.reason === "same-link" ? "אותו קישור" : dupPrompt.match.reason === "same-title" ? "אותו שם" : "מצרכים כמעט זהים"}
              {dupPrompt.match.identical ? " (התוכן זהה)" : ""}. מה לעשות?
            </p>
            <button type="button" onClick={() => void resolveDuplicate("merge")} className="rounded-xl bg-amber-500 px-4 py-2.5 text-sm font-semibold text-white hover:bg-amber-600">
              מזג - להשלים בקיים מה שחסר
            </button>
            <button type="button" onClick={() => void resolveDuplicate("replace")} className="rounded-xl border border-amber-300 px-4 py-2.5 text-sm font-semibold text-amber-800 hover:bg-amber-50 dark:border-amber-800 dark:text-amber-300 dark:hover:bg-stone-800">
              עדכן לגרסה החדשה
            </button>
            <button type="button" onClick={() => void resolveDuplicate("new")} className="rounded-xl border border-stone-200 px-4 py-2.5 text-sm font-medium text-stone-600 hover:bg-stone-50 dark:border-stone-700 dark:text-stone-300 dark:hover:bg-stone-800">
              שמור כמתכון נפרד
            </button>
            <button type="button" onClick={() => setDupPrompt(null)} className="text-xs font-medium text-stone-500 hover:underline">
              חזרה לעריכה
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

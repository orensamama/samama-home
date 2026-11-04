"use client";

import { useState, type ChangeEvent } from "react";
import { FileUp, Link2, ScrollText, TriangleAlert, X } from "lucide-react";
import RecipeTagPicker from "@/components/RecipeTagPicker";
import SetupSqlButton from "@/components/SetupSqlButton";
import { describeRecipesTable, draftFromLink, fetchLinkInfo, insertRecipe, saveRecipeDraft } from "@/lib/recipeActions";
import {
  recipeToDraft,
  embedFromUrl,
  emptyDraft,
  extractChatRecipes,
  findDuplicate,
  mergeIntoExisting,
  replaceWithNewer,
  suggestCategories,
  type ChatRecipeCandidate,
  type DuplicateMatch,
  type Recipe,
  type RecipeDraft,
} from "@/lib/recipeData";

type ImportAction = "new" | "skip" | "merge" | "replace";

type ImportItem = {
  key: number;
  candidate: ChatRecipeCandidate;
  draft: RecipeDraft;
  dup: DuplicateMatch | null;
  action: ImportAction;
  include: boolean;
};

/** One recipe that couldn't be saved, with Supabase's own words for why. */
type SaveFailure = {
  title: string;
  action: string;
  code?: string;
  message: string;
  details?: string | null;
  hint?: string | null;
};

const MAX_LINKS = 80;
const CONCURRENCY = 3;

const REASON_TEXT: Record<DuplicateMatch["reason"], string> = {
  "same-link": "אותו קישור",
  "same-title": "אותו שם",
  "same-ingredients": "מצרכים כמעט זהים",
};

function asRecipe(draft: RecipeDraft, id: string): Recipe {
  return { ...draft, id, is_favorite: false, created_at: "", updated_at: "" };
}

/** Builds the recipe draft for one chat message. Text recipes are split as written; links are looked up. */
async function buildDraft(candidate: ChatRecipeCandidate): Promise<RecipeDraft> {
  if (candidate.kind === "text") {
    const { parsed } = candidate;
    return {
      ...emptyDraft(),
      title: parsed.title,
      categories: suggestCategories({ title: parsed.title, ingredients: parsed.ingredients }),
      ingredients: parsed.ingredients,
      instructions: parsed.instructions,
      tips: parsed.tips,
      description: parsed.intro,
      servings: parsed.servings,
      source_url: candidate.url,
      embed_url: candidate.url ? (embedFromUrl(candidate.url)?.embedUrl ?? null) : null,
      original_text: candidate.original,
    };
  }
  const url = candidate.url as string;
  const caption = candidate.original.replace(/https?:\/\/[^\s<>"')\]]+/gi, "").trim();
  const draft = draftFromLink(url, await fetchLinkInfo(url), caption);
  if (!draft.title) {
    try {
      draft.title = `מתכון מ-${new URL(url).hostname.replace(/^www\./, "")}`;
    } catch {
      draft.title = "מתכון מקישור";
    }
  }
  draft.original_text = draft.original_text ?? candidate.original;
  return draft;
}

/**
 * Imports recipes from a WhatsApp "_chat.txt" export. Faithful to the source:
 * recipe messages are split into fields without rewording, shared links keep
 * their original player and text, and similar recipes are never silently
 * duplicated -- you choose to skip, merge, take the newer version, or keep both.
 */
export default function RecipeImportPanel({
  recipes,
  allTags,
  onCreateTag,
  onDone,
  onClose,
}: {
  recipes: Recipe[];
  allTags: string[];
  onCreateTag: (name: string) => void;
  onDone: () => void;
  onClose: () => void;
}) {
  const [stage, setStage] = useState<"pick" | "working" | "review" | "saving" | "done">("pick");
  const [pasted, setPasted] = useState("");
  const [progress, setProgress] = useState("");
  const [items, setItems] = useState<ImportItem[]>([]);
  const [mergedInFile, setMergedInFile] = useState(0);
  const [tags, setTags] = useState<string[]>([]);
  const [summary, setSummary] = useState<string[]>([]);
  const [failures, setFailures] = useState<SaveFailure[]>([]);
  const [tableInfo, setTableInfo] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function analyse(text: string) {
    setError(null);
    const candidates = extractChatRecipes(text);
    if (candidates.length === 0) {
      setError("לא נמצאו מתכונים או קישורים לסרטונים בקובץ. ודאו שזה קובץ הצ'אט (_chat.txt) שיוצא מוואטסאפ.");
      return;
    }
    setStage("working");

    // Look up links a few at a time; text recipes need no network.
    const links = candidates.filter((candidate) => candidate.kind === "link").slice(0, MAX_LINKS);
    const skipped = candidates.filter((candidate) => candidate.kind === "link").length - links.length;
    const drafts = new Map<ChatRecipeCandidate, RecipeDraft>();
    for (const candidate of candidates.filter((c) => c.kind === "text")) drafts.set(candidate, await buildDraft(candidate));
    for (let i = 0; i < links.length; i += CONCURRENCY) {
      setProgress(`קורא קישורים... ${Math.min(i + CONCURRENCY, links.length)} מתוך ${links.length}`);
      const chunk = links.slice(i, i + CONCURRENCY);
      const built = await Promise.all(chunk.map((candidate) => buildDraft(candidate)));
      chunk.forEach((candidate, index) => drafts.set(candidate, built[index]));
    }

    // Chat order is chronological: when the same recipe shows up twice in the file, the later one wins.
    const batch: { candidate: ChatRecipeCandidate; draft: RecipeDraft }[] = [];
    let merged = 0;
    for (const candidate of candidates) {
      const draft = drafts.get(candidate);
      if (!draft) continue;
      // Inside the file only the same link or the same name counts as "the same recipe":
      // two different pastas that merely share ingredients must stay separate.
      const index = batch.findIndex((entry, i) => {
        const match = findDuplicate(draft, [asRecipe(entry.draft, `batch-${i}`)]);
        return match !== null && match.reason !== "same-ingredients";
      });
      if (index >= 0) {
        // Newer version wins, but anything it lacks (e.g. a bare link vs. the full text posted earlier) is kept.
        const older = batch[index].draft;
        batch[index] = {
          candidate,
          draft: {
            ...draft,
            title: draft.title || older.title,
            servings: draft.servings ?? older.servings,
            ingredients: draft.ingredients.length > 0 ? draft.ingredients : older.ingredients,
            instructions: draft.instructions || older.instructions,
            tips: draft.tips || older.tips,
            description: draft.description || older.description,
            image_url: draft.image_url ?? older.image_url,
            embed_url: draft.embed_url ?? older.embed_url,
            source_url: draft.source_url ?? older.source_url,
            original_text: draft.original_text ?? older.original_text,
          },
        };
        merged++;
      } else batch.push({ candidate, draft });
    }

    setItems(
      batch.map(({ candidate, draft }, index) => {
        const dup = findDuplicate(draft, recipes);
        const action: ImportAction = !dup ? "new" : dup.identical ? "skip" : "merge";
        return { key: index, candidate, draft, dup, action, include: true };
      })
    );
    setMergedInFile(merged);
    if (skipped > 0) setError(`נקראו ${MAX_LINKS} הקישורים הראשונים; ${skipped} נוספים לא נכללו - אפשר לייבא שוב בנפרד.`);
    setStage("review");
  }

  async function handleFile(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    if (/\.zip$/i.test(file.name)) {
      setError("זה קובץ ZIP. חלצו אותו ובחרו את הקובץ _chat.txt שבתוכו.");
      return;
    }
    await analyse(await file.text());
  }

  function update(key: number, patch: Partial<ImportItem>) {
    setItems((current) => current.map((item) => (item.key === key ? { ...item, ...patch } : item)));
  }

  // One choice for every item that matches a recipe already in the book -- including
  // identical ones, so a repeat import can replace what was saved before.
  function applyToAllDuplicates(action: ImportAction) {
    setItems((current) => current.map((item) => (item.dup ? { ...item, action, include: true } : item)));
  }
  const duplicateCount = items.filter((item) => item.dup).length;

  async function handleImport() {
    setStage("saving");
    for (const tag of tags) if (!allTags.includes(tag)) onCreateTag(tag);

    let added = 0;
    let updated = 0;
    let skipped = 0;
    const failed: SaveFailure[] = [];
    for (const item of items) {
      if (!item.include || item.action === "skip") {
        skipped++;
        continue;
      }
      const draft: RecipeDraft = { ...item.draft, categories: Array.from(new Set([...item.draft.categories, ...tags])) };
      let saveError: { code?: string; message: string; details?: string | null; hint?: string | null } | null = null;
      if (item.action === "new" || !item.dup) {
        saveError = (await insertRecipe(draft)).error;
        if (!saveError) added++;
      } else {
        // Merge fills what's missing; replace takes the chat's version. Either way the whole recipe is saved.
        const patch = item.action === "merge" ? mergeIntoExisting(item.dup.existing, draft) : replaceWithNewer(item.dup.existing, draft);
        saveError = (await saveRecipeDraft(item.dup.existing.id, { ...recipeToDraft(item.dup.existing), ...patch })).error;
        if (!saveError) updated++;
      }
      if (saveError) {
        failed.push({
          title: draft.title || "מתכון ללא שם",
          action: item.action === "new" || !item.dup ? "הוספה" : item.action === "merge" ? "מיזוג" : "החלפה",
          code: saveError.code,
          message: saveError.message,
          details: saveError.details,
          hint: saveError.hint,
        });
      }
    }

    const lines = [`נוספו ${added} מתכונים חדשים`];
    if (updated > 0) lines.push(`עודכנו ${updated} מתכונים קיימים`);
    if (skipped > 0) lines.push(`דולגו ${skipped} (כבר קיימים או שלא סומנו)`);
    if (mergedInFile > 0) lines.push(`${mergedInFile} כפילויות בתוך הקובץ אוחדו (אותו שם או אותו קישור; נשמרה הגרסה האחרונה)`);
    setSummary(lines);
    setFailures(failed);
    setStage("done");
    onDone();
    // What the table really looks like, so a column/type mismatch is visible right here.
    if (failed.length > 0) setTableInfo(await describeRecipesTable());
  }

  function copyDiagnostics() {
    const text = [
      ...failures.map((failure) => JSON.stringify(failure, null, 2)),
      "",
      tableInfo ?? "",
    ].join("\n");
    void navigator.clipboard?.writeText(text).then(() => setCopied(true));
  }

  const selected = items.filter((item) => item.include && item.action !== "skip").length;

  return (
    <div className="fixed inset-0 z-[60] flex items-end justify-center bg-black/40 sm:items-center">
      <div className="flex max-h-[92dvh] w-full flex-col overflow-hidden rounded-t-3xl bg-white shadow-lg sm:max-w-xl sm:rounded-3xl dark:bg-stone-900">
        <div className="flex shrink-0 items-center justify-between border-b border-amber-100 p-4 dark:border-amber-950/30">
          <h2 className="text-lg font-bold text-stone-800 dark:text-stone-100">ייבוא מצ&apos;אט וואטסאפ</h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="סגירה"
            className="rounded-full p-1.5 text-stone-400 hover:bg-stone-100 dark:hover:bg-stone-800"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="flex flex-1 flex-col gap-3 overflow-y-auto p-4">
          {error && <p className="rounded-xl bg-amber-50 px-3 py-2 text-xs text-amber-800 dark:bg-amber-950/20 dark:text-amber-300">{error}</p>}

          {stage === "pick" && (
            <>
              <ol className="list-decimal ps-5 text-sm text-stone-600 dark:text-stone-300">
                <li>בוואטסאפ: פתחו את הצ&apos;אט ← ⋮ ← עוד ← ייצוא צ&apos;אט ← ללא מדיה.</li>
                <li>בחרו כאן את הקובץ <span dir="ltr">_chat.txt</span> (אם קיבלתם ZIP - חלצו אותו קודם).</li>
              </ol>
              <label className="flex cursor-pointer items-center justify-center gap-2 rounded-xl border border-dashed border-amber-300 bg-amber-50 px-3 py-4 text-sm font-semibold text-amber-800 hover:bg-amber-100 dark:border-amber-800 dark:bg-amber-950/30 dark:text-amber-300">
                <FileUp className="h-5 w-5" />
                בחירת קובץ הצ&apos;אט
                <input type="file" accept=".txt,text/plain" className="hidden" onChange={handleFile} />
              </label>
              <details className="text-xs text-stone-500 dark:text-stone-400">
                <summary className="cursor-pointer">או הדביקו את תוכן הצ&apos;אט</summary>
                <textarea
                  value={pasted}
                  onChange={(event) => setPasted(event.target.value)}
                  rows={6}
                  className="mt-2 w-full rounded-xl border border-amber-200 bg-white px-3 py-2 text-sm text-stone-700 outline-none focus:border-amber-400 dark:border-amber-900/50 dark:bg-stone-950 dark:text-stone-200"
                />
                <button
                  type="button"
                  disabled={!pasted.trim()}
                  onClick={() => void analyse(pasted)}
                  className="mt-2 rounded-lg bg-amber-500 px-3 py-1.5 text-sm font-semibold text-white disabled:opacity-50"
                >
                  ניתוח
                </button>
              </details>
              <p className="text-xs text-stone-500 dark:text-stone-400">
                הייבוא נאמן למקור: מתכוני טקסט מפורקים לשדות בלי לשנות ניסוח או כמויות, וקישורים לסרטונים נשמרים עם הנגן
                המקורי והטקסט שמצורף אליהם. הטקסט המקורי נשמר תמיד.
              </p>
            </>
          )}

          {stage === "working" && <p className="py-6 text-center text-sm text-stone-600 dark:text-stone-300">{progress || "מנתח את הצ'אט..."}</p>}

          {stage === "review" && (
            <>
              <p className="text-sm text-stone-700 dark:text-stone-200">
                נמצאו <strong>{items.length}</strong> פריטים. עברו על הרשימה, בחרו מה לשמור, ולחצו ייבוא.
              </p>

              <div>
                <p className="mb-1.5 text-xs font-medium text-stone-500 dark:text-stone-400">תגיות לכל המתכונים המיובאים (לא חובה)</p>
                <RecipeTagPicker allTags={allTags} selected={tags} onChange={setTags} />
              </div>

              {duplicateCount > 0 && (
                <div className="rounded-xl border border-amber-200 bg-amber-50 p-3 dark:border-amber-900/40 dark:bg-amber-950/20">
                  <p className="mb-1.5 text-xs font-medium text-amber-800 dark:text-amber-300">
                    {duplicateCount} פריטים כבר קיימים בספר (גם זהים). לייבוא מחדש והחלפה - בחרו לכולם:
                  </p>
                  <div className="flex flex-wrap gap-1.5">
                    {(
                      [
                        ["skip", "דלג על הכול"],
                        ["merge", "מזג הכול"],
                        ["replace", "החלף את הקיימים"],
                        ["new", "שמור כנפרדים"],
                      ] as [ImportAction, string][]
                    ).map(([action, label]) => (
                      <button
                        key={action}
                        type="button"
                        onClick={() => applyToAllDuplicates(action)}
                        className="rounded-full border border-amber-300 bg-white px-3 py-1 text-xs font-medium text-amber-800 hover:bg-amber-100 dark:border-amber-800 dark:bg-stone-900 dark:text-amber-300"
                      >
                        {label}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              <ul className="flex flex-col gap-2">
                {items.map((item) => (
                  <li key={item.key} className="rounded-xl border border-amber-100 p-3 dark:border-amber-950/30">
                    <div className="flex items-start gap-2">
                      <input
                        type="checkbox"
                        className="mt-1"
                        checked={item.include && item.action !== "skip"}
                        onChange={(event) => update(item.key, { include: event.target.checked })}
                        aria-label="לייבא פריט זה"
                      />
                      <div className="min-w-0 flex-1">
                        <p className="flex items-center gap-1.5 text-sm font-semibold text-stone-800 dark:text-stone-100">
                          {item.candidate.kind === "link" ? <Link2 className="h-3.5 w-3.5 shrink-0 text-sky-500" /> : <ScrollText className="h-3.5 w-3.5 shrink-0 text-amber-500" />}
                          <span className="truncate">{item.draft.title || "ללא שם"}</span>
                        </p>
                        <p className="text-[11px] text-stone-400 dark:text-stone-500">
                          {[item.candidate.sender, item.candidate.date, item.draft.ingredients.length > 0 ? `${item.draft.ingredients.length} מצרכים` : null, item.draft.embed_url ? "עם נגן" : null]
                            .filter(Boolean)
                            .join(" · ")}
                        </p>
                        {item.candidate.needsReview && (
                          <p className="mt-0.5 flex items-center gap-1 text-[11px] text-amber-700 dark:text-amber-400">
                            <TriangleAlert className="h-3 w-3" />
                            כדאי לעבור על זה אחרי הייבוא (לא הצלחנו לפרק הכול אוטומטית)
                          </p>
                        )}
                        {item.dup && (
                          <div className="mt-1.5 rounded-lg bg-amber-50 p-2 text-xs dark:bg-amber-950/20">
                            <p className="text-amber-800 dark:text-amber-300">
                              {item.dup.identical ? "כבר קיים (זהה):" : `דומה למתכון קיים (${REASON_TEXT[item.dup.reason]}):`} &quot;{item.dup.existing.title}&quot;
                            </p>
                            <select
                              value={item.action}
                              onChange={(event) => update(item.key, { action: event.target.value as ImportAction })}
                              aria-label="מה לעשות עם הכפילות"
                              className="mt-1 w-full rounded-lg border border-amber-200 bg-white px-2 py-1 text-xs text-stone-700 dark:border-amber-900/50 dark:bg-stone-950 dark:text-stone-200"
                            >
                              <option value="skip">דלג - להשאיר את הקיים</option>
                              <option value="merge">מזג - להשלים בקיים מה שחסר</option>
                              <option value="replace">עדכן לגרסה החדשה (מהצ&apos;אט)</option>
                              <option value="new">שמור כמתכון נפרד</option>
                            </select>
                          </div>
                        )}
                      </div>
                    </div>
                  </li>
                ))}
              </ul>
            </>
          )}

          {stage === "saving" && <p className="py-6 text-center text-sm text-stone-600 dark:text-stone-300">מייבא...</p>}

          {stage === "done" && (
            <>
              <ul className="flex flex-col gap-1 py-2 text-sm text-stone-700 dark:text-stone-200">
                {summary.map((line) => (
                  <li key={line}>✓ {line}</li>
                ))}
              </ul>

              {failures.length > 0 && (
                <div className="flex flex-col gap-2 rounded-xl border border-rose-200 bg-rose-50 p-3 dark:border-rose-900/50 dark:bg-rose-950/20">
                  <p className="text-sm font-bold text-rose-700 dark:text-rose-300">
                    ✗ נכשלה שמירה של {failures.length} פריטים - השגיאה המדויקת מ-Supabase:
                  </p>
                  <ul className="flex max-h-56 flex-col gap-2 overflow-y-auto">
                    {failures.map((failure, index) => (
                      <li key={`${index}-${failure.title}`} className="rounded-lg bg-white/70 p-2 text-xs dark:bg-stone-900/60">
                        <p className="font-semibold text-stone-800 dark:text-stone-100">
                          {failure.title} <span className="font-normal text-stone-400">({failure.action})</span>
                        </p>
                        <pre dir="ltr" className="mt-1 whitespace-pre-wrap break-words text-[11px] text-rose-700 dark:text-rose-300">
                          {[
                            failure.code ? `code: ${failure.code}` : null,
                            `message: ${failure.message}`,
                            failure.details ? `details: ${failure.details}` : null,
                            failure.hint ? `hint: ${failure.hint}` : null,
                          ]
                            .filter(Boolean)
                            .join("\n")}
                        </pre>
                      </li>
                    ))}
                  </ul>
                  {tableInfo ? (
                    <pre dir="ltr" className="max-h-40 overflow-auto whitespace-pre-wrap rounded-lg bg-white/70 p-2 text-[11px] text-stone-600 dark:bg-stone-900/60 dark:text-stone-300">
                      {tableInfo}
                    </pre>
                  ) : (
                    <p className="text-[11px] text-stone-500">בודק את מבנה הטבלה...</p>
                  )}
                  <div className="flex flex-wrap items-center gap-3">
                    <button
                      type="button"
                      onClick={copyDiagnostics}
                      className="rounded-lg bg-rose-500 px-3 py-1.5 text-xs font-semibold text-white hover:bg-rose-600"
                    >
                      {copied ? "הועתק!" : "העתק פרטי שגיאה"}
                    </button>
                    <span className="text-[11px] text-stone-500 dark:text-stone-400">אותם פרטים מופיעים גם בקונסול (F12) תחת [Supabase] recipes.</span>
                  </div>
                  <SetupSqlButton />
                </div>
              )}
            </>
          )}
        </div>

        {(stage === "review" || stage === "done") && (
          <div className="shrink-0 border-t border-amber-100 bg-white p-4 dark:border-amber-950/30 dark:bg-stone-900">
            {stage === "review" ? (
              <button
                type="button"
                onClick={handleImport}
                disabled={selected === 0}
                className="w-full rounded-xl bg-amber-500 px-4 py-3 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-amber-600 disabled:opacity-50"
              >
                ייבוא {selected} פריטים
              </button>
            ) : (
              <button
                type="button"
                onClick={onClose}
                className="w-full rounded-xl bg-amber-500 px-4 py-3 text-sm font-semibold text-white shadow-sm hover:bg-amber-600"
              >
                סגירה
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

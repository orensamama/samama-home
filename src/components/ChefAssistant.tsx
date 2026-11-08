"use client";

import { useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import { BookmarkPlus, ChefHat, Send, X } from "lucide-react";
import { chefSuggestions } from "@/lib/chefSuggestions";
import type { Recipe } from "@/lib/recipeData";

// Just above the server's own 8s cap, so the server's JSON answer (with its reason) arrives first.
const CLIENT_TIMEOUT_MS = 10000;

type Turn = { role: "user" | "assistant"; content: string };

const ERROR_TEXT: Record<string, string> = {
  no_key: "העוזר עדיין לא הופעל: צריך להגדיר GEMINI_API_KEY בהגדרות הפרויקט ב-Vercel (Settings ← Environment Variables) ולפרוס מחדש. מפתח חינמי: aistudio.google.com/apikey",
  bad_key: "מפתח ה-API שהוגדר לא תקין. בדקו את GEMINI_API_KEY ב-Vercel.",
  rate_limited: "יותר מדי שאלות בזמן קצר. נסו שוב בעוד כמה דקות.",
  timeout: "השף לא הגיב בזמן (לקח יותר מדי זמן). נסו שוב בעוד רגע, או נסחו את השאלה קצרה יותר.",
  busy: "השף עסוק כרגע. נסו שוב בעוד רגע.",
};

// Questions for the free-standing chef (no recipe open).
const FREE_SUGGESTIONS = [
  "איך מכינים ויניגרט בסיסי לסלט?",
  "איך מכינים רוטב עגבניות מהיר?",
  "מה אפשר לשים במקום שמנת מתוקה?",
  "איך מכינים רוטב טחינה מושלם?",
];

/**
 * "Ask the chef". With a `recipe` it answers about that recipe (and shows a floating button);
 * without one it is a free-standing cooking assistant, opened from outside via `open`. Any answer
 * can be turned into a new recipe with "save as a new recipe".
 */
export default function ChefAssistant({
  recipe = null,
  open: openProp,
  onOpenChange,
  showFab = true,
  onSaveAsRecipe,
}: {
  recipe?: Recipe | null;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  showFab?: boolean;
  /** Called with the chef's last answer when "save as a new recipe" is pressed. */
  onSaveAsRecipe?: (answer: string) => void;
}) {
  const [internalOpen, setInternalOpen] = useState(false);
  const open = openProp ?? internalOpen;
  const setOpen = (value: boolean) => (onOpenChange ? onOpenChange(value) : setInternalOpen(value));
  const [turns, setTurns] = useState<Turn[]>([]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const endRef = useRef<HTMLDivElement>(null);
  // Quick questions made from this recipe's own ingredients (no "make it parve" for a meat dish).
  const suggestions = useMemo(() => (recipe ? chefSuggestions(recipe) : FREE_SUGGESTIONS), [recipe]);
  const lastAnswer = [...turns].reverse().find((turn) => turn.role === "assistant")?.content ?? null;

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [turns, busy, open]);

  async function ask(question: string) {
    const text = question.trim();
    if (!text || busy) return;
    const next: Turn[] = [...turns, { role: "user", content: text }];
    setTurns(next);
    setInput("");
    setError(null);
    setBusy(true);
    // The server gives up on Gemini after 8 seconds; if nothing at all comes back by 10 the
    // "thinking" state ends here with a message instead of hanging.
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), CLIENT_TIMEOUT_MS);
    try {
      const response = await fetch("/api/chef", {
        method: "POST",
        signal: controller.signal,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          recipe: recipe
            ? {
                title: recipe.title,
                servings: recipe.servings,
                ingredients: recipe.ingredients,
                instructions: recipe.instructions,
                tips: recipe.tips,
              }
            : undefined,
          messages: next,
        }),
      });
      const data = (await response.json().catch(() => ({}))) as { answer?: string; error?: string; detail?: string };
      if (!response.ok || !data.answer) {
        const base = ERROR_TEXT[data.error ?? ""] ?? "לא הצלחנו לקבל תשובה מהשף. נסו שוב.";
        // The server's own words about what went wrong (never contains the key) -- so a failure can be diagnosed.
        setError(data.detail ? `${base}\n\nפרטים: ${data.detail}` : base);
      } else {
        setTurns([...next, { role: "assistant", content: data.answer }]);
      }
    } catch (err) {
      const timedOut = err instanceof DOMException && err.name === "AbortError";
      setError(timedOut ? ERROR_TEXT.timeout : "אין חיבור לשרת. נסו שוב.");
    } finally {
      clearTimeout(timer);
      setBusy(false);
    }
  }

  function handleSubmit(event: FormEvent) {
    event.preventDefault();
    void ask(input);
  }

  return (
    <>
      {showFab && !open && (
        <button
          type="button"
          onClick={() => setOpen(true)}
          aria-label="שאל את השף"
          // Well above the bottom bar (and its safe area), so it never touches it.
          className="fixed bottom-[calc(7.5rem+env(safe-area-inset-bottom))] left-3 z-40 flex items-center gap-1.5 rounded-full bg-stone-800 px-3.5 py-2 text-xs font-semibold text-white shadow-lg transition-colors hover:bg-stone-700 active:scale-95 dark:bg-amber-500 dark:hover:bg-amber-600"
        >
          <ChefHat className="h-4 w-4" />
          שאל את השף
        </button>
      )}

      {open && (
        <div className="fixed inset-0 z-[60] flex items-end justify-center bg-black/40 sm:items-center">
          <div className="flex h-[80dvh] w-full flex-col overflow-hidden rounded-t-3xl bg-white shadow-lg sm:h-[34rem] sm:max-w-md sm:rounded-3xl dark:bg-stone-900">
            <div className="flex shrink-0 items-center justify-between border-b border-amber-100 p-4 dark:border-amber-950/30">
              <div className="min-w-0">
                <h2 className="flex items-center gap-2 text-base font-bold text-stone-800 dark:text-stone-100">
                  <ChefHat className="h-5 w-5 text-amber-500" />
                  שאל את השף
                </h2>
                <p className="truncate text-xs text-stone-400">{recipe ? `על: ${recipe.title}` : "שף חופשי - כל שאלה על בישול"}</p>
              </div>
              <button type="button" onClick={() => setOpen(false)} aria-label="סגירה" className="rounded-full p-1.5 text-stone-400 hover:bg-stone-100 dark:hover:bg-stone-800">
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="flex flex-1 flex-col gap-3 overflow-y-auto p-4">
              {turns.length === 0 && (
                <div className="flex flex-col gap-2">
                  <p className="text-sm text-stone-600 dark:text-stone-300">
                    {recipe ? "שאלו כל דבר על המתכון הזה - תחליפים, כלי בישול אחרים, התאמות:" : "התייעצו על רוטב, ויניגרט, תחליפים או טכניקה:"}
                  </p>
                  {suggestions.map((suggestion) => (
                    <button
                      key={suggestion}
                      type="button"
                      onClick={() => void ask(suggestion)}
                      className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-right text-sm text-amber-900 hover:bg-amber-100 dark:border-amber-900/50 dark:bg-amber-950/30 dark:text-amber-200"
                    >
                      {suggestion}
                    </button>
                  ))}
                </div>
              )}

              {turns.map((turn, index) => (
                <div
                  key={index}
                  className={`max-w-[85%] whitespace-pre-wrap rounded-2xl px-3 py-2 text-sm leading-relaxed ${
                    turn.role === "user"
                      ? "self-start bg-amber-500 text-white"
                      : "self-end bg-stone-100 text-stone-800 dark:bg-stone-800 dark:text-stone-100"
                  }`}
                >
                  {turn.content}
                </div>
              ))}
              {busy && <div className="self-end rounded-2xl bg-stone-100 px-3 py-2 text-sm text-stone-400 dark:bg-stone-800">השף חושב...</div>}
              {error && <p className="whitespace-pre-wrap break-words rounded-xl bg-rose-50 px-3 py-2 text-xs text-rose-700 dark:bg-rose-950/30 dark:text-rose-300">{error}</p>}
              <div ref={endRef} />
            </div>

            {onSaveAsRecipe && lastAnswer && !busy && (
              <div className="shrink-0 border-t border-amber-100 px-3 pt-2 dark:border-amber-950/30">
                <button
                  type="button"
                  onClick={() => {
                    onSaveAsRecipe(lastAnswer);
                    setOpen(false);
                  }}
                  className="flex w-full items-center justify-center gap-1.5 rounded-xl border border-amber-300 bg-amber-50 px-3 py-2 text-sm font-semibold text-amber-800 hover:bg-amber-100 dark:border-amber-800 dark:bg-amber-950/30 dark:text-amber-300"
                >
                  <BookmarkPlus className="h-4 w-4" />
                  שמור כמתכון חדש
                </button>
              </div>
            )}

            <form onSubmit={handleSubmit} className="flex shrink-0 gap-2 p-3">
              <input
                type="text"
                value={input}
                onChange={(event) => setInput(event.target.value)}
                maxLength={500}
                placeholder={suggestions[0] ?? "שאלו את השף..."}
                aria-label="שאלה לשף"
                className="min-w-0 flex-1 rounded-xl border border-amber-200 bg-white px-3 py-2 text-sm text-stone-700 outline-none focus:border-amber-400 dark:border-amber-900/50 dark:bg-stone-950 dark:text-stone-200"
              />
              <button
                type="submit"
                disabled={!input.trim() || busy}
                aria-label="שליחה"
                className="shrink-0 rounded-xl bg-amber-500 px-3 text-white transition-colors hover:bg-amber-600 disabled:opacity-50"
              >
                <Send className="h-4 w-4 -scale-x-100" />
              </button>
            </form>
          </div>
        </div>
      )}
    </>
  );
}

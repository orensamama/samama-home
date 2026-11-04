"use client";

import { useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import { ChefHat, Send, X } from "lucide-react";
import { chefSuggestions } from "@/lib/chefSuggestions";
import type { Recipe } from "@/lib/recipeData";

type Turn = { role: "user" | "assistant"; content: string };


const ERROR_TEXT: Record<string, string> = {
  no_key: "העוזר עדיין לא הופעל: צריך להגדיר GEMINI_API_KEY בהגדרות הפרויקט ב-Vercel (Settings ← Environment Variables) ולפרוס מחדש. מפתח חינמי: aistudio.google.com/apikey",
  bad_key: "מפתח ה-API שהוגדר לא תקין. בדקו את GEMINI_API_KEY ב-Vercel.",
  rate_limited: "יותר מדי שאלות בזמן קצר. נסו שוב בעוד כמה דקות.",
  busy: "השף עסוק כרגע. נסו שוב בעוד רגע.",
};

/** A floating "ask the chef" button on the recipe page that opens a chat about this recipe. */
export default function ChefAssistant({ recipe }: { recipe: Recipe }) {
  const [open, setOpen] = useState(false);
  const [turns, setTurns] = useState<Turn[]>([]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const endRef = useRef<HTMLDivElement>(null);
  // Quick questions made from this recipe's own ingredients (no "make it parve" for a meat dish).
  const suggestions = useMemo(() => chefSuggestions(recipe), [recipe]);

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
    try {
      const response = await fetch("/api/chef", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          recipe: {
            title: recipe.title,
            servings: recipe.servings,
            ingredients: recipe.ingredients,
            instructions: recipe.instructions,
            tips: recipe.tips,
          },
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
    } catch {
      setError("אין חיבור לשרת. נסו שוב.");
    } finally {
      setBusy(false);
    }
  }

  function handleSubmit(event: FormEvent) {
    event.preventDefault();
    void ask(input);
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label="שאל את השף"
        className="fixed bottom-20 left-4 z-40 flex items-center gap-1.5 rounded-full bg-stone-800 px-4 py-2.5 text-sm font-semibold text-white shadow-lg transition-colors hover:bg-stone-700 active:scale-95 dark:bg-amber-500 dark:hover:bg-amber-600"
      >
        <ChefHat className="h-4 w-4" />
        שאל את השף
      </button>

      {open && (
        <div className="fixed inset-0 z-[60] flex items-end justify-center bg-black/40 sm:items-center">
          <div className="flex h-[80dvh] w-full flex-col overflow-hidden rounded-t-3xl bg-white shadow-lg sm:h-[34rem] sm:max-w-md sm:rounded-3xl dark:bg-stone-900">
            <div className="flex shrink-0 items-center justify-between border-b border-amber-100 p-4 dark:border-amber-950/30">
              <div className="min-w-0">
                <h2 className="flex items-center gap-2 text-base font-bold text-stone-800 dark:text-stone-100">
                  <ChefHat className="h-5 w-5 text-amber-500" />
                  שאל את השף
                </h2>
                <p className="truncate text-xs text-stone-400">על: {recipe.title}</p>
              </div>
              <button type="button" onClick={() => setOpen(false)} aria-label="סגירה" className="rounded-full p-1.5 text-stone-400 hover:bg-stone-100 dark:hover:bg-stone-800">
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="flex flex-1 flex-col gap-3 overflow-y-auto p-4">
              {turns.length === 0 && (
                <div className="flex flex-col gap-2">
                  <p className="text-sm text-stone-600 dark:text-stone-300">שאלו כל דבר על המתכון הזה - תחליפים, כלי בישול אחרים, התאמות:</p>
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

            <form onSubmit={handleSubmit} className="flex shrink-0 gap-2 border-t border-amber-100 p-3 dark:border-amber-950/30">
              <input
                type="text"
                value={input}
                onChange={(event) => setInput(event.target.value)}
                maxLength={500}
                placeholder={suggestions[0] ?? "שאלו את השף על המתכון..."}
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

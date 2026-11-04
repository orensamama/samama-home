"use client";

import { useState, type ChangeEvent } from "react";
import { Camera, FileUp, Image as ImageIcon, Mic, X } from "lucide-react";
import { draftFromLink, fetchLinkInfo } from "@/lib/recipeActions";
import { draftFromText, extractUrls, looksLikeRecipeText, type RecipeDraft } from "@/lib/recipeData";
import { readTextFromImage } from "@/lib/ocrImage";
import { useSpeechDictation } from "@/lib/useSpeechDictation";

/**
 * Quick entry for a new recipe: paste free text or a video/site link, dictate it,
 * or photograph a recipe page. Whatever comes in is split into fields exactly as
 * written and opened in the editor for a final look -- nothing is saved blindly.
 */
export default function RecipeAddModal({
  onDraft,
  onImportChat,
  onManual,
  onClose,
}: {
  onDraft: (draft: RecipeDraft, notice: string | null) => void;
  onImportChat: () => void;
  onManual: () => void;
  onClose: () => void;
}) {
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  const dictation = useSpeechDictation((text) => setInput((current) => (current.trim() ? `${current.trim()}\n${text}` : text)));

  async function handlePhoto(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    setBusy("קורא את הטקסט מהתמונה... (בפעם הראשונה ההורדה של מנוע הזיהוי לוקחת רגע)");
    setMessage(null);
    try {
      const text = (await readTextFromImage(file)).trim();
      if (text) {
        setInput((current) => (current.trim() ? `${current.trim()}\n\n${text}` : text));
        setMessage("הטקסט נקרא מהתמונה. אפשר לתקן אותו כאן לפני שממשיכים (אפשר גם לצלם עוד עמוד).");
      } else {
        setMessage("לא הצלחנו לקרוא טקסט בתמונה. נסו תמונה חדה יותר ובתאורה טובה.");
      }
    } catch (err) {
      console.error("[OCR] מתכון מתמונה:", err);
      setMessage("הקריאה מהתמונה נכשלה (ייתכן שאין חיבור לאינטרנט).");
    } finally {
      setBusy(null);
    }
  }

  async function handleContinue() {
    const text = input.trim();
    if (!text || busy) return;
    const urls = extractUrls(text);

    if (urls.length === 0) {
      onDraft(draftFromText(text), null);
      return;
    }

    setBusy("קורא את הקישור...");
    setMessage(null);
    const url = urls[0];
    const caption = text.replace(/https?:\/\/[^\s<>"')\]]+/gi, "").trim();
    const info = await fetchLinkInfo(url);
    setBusy(null);

    // A full recipe pasted together with its link: the pasted text is the recipe, the link rides along.
    if (looksLikeRecipeText(caption)) {
      const draft = draftFromText(caption);
      const fromLink = draftFromLink(url, info);
      onDraft(
        { ...draft, source_url: fromLink.source_url, embed_url: fromLink.embed_url, image_url: fromLink.image_url },
        null
      );
      return;
    }
    const draft = draftFromLink(url, info, caption);
    onDraft(draft, info?.note ?? (info && !info.description && !info.recipe ? "הקישור נשמר עם הנגן; לא נמצא טקסט מתכון בעמוד." : null));
  }

  const actionButton =
    "flex cursor-pointer items-center justify-center gap-1.5 rounded-xl border border-amber-300 bg-amber-50 px-3 py-2.5 text-sm font-semibold text-amber-800 transition-colors hover:bg-amber-100 dark:border-amber-800 dark:bg-amber-950/30 dark:text-amber-300";

  return (
    <div className="fixed inset-0 z-[60] flex items-end justify-center bg-black/40 sm:items-center">
      <div className="flex max-h-[92dvh] w-full flex-col overflow-hidden rounded-t-3xl bg-white shadow-lg sm:max-w-lg sm:rounded-3xl dark:bg-stone-900">
        <div className="flex shrink-0 items-center justify-between border-b border-amber-100 p-4 dark:border-amber-950/30">
          <h2 className="text-lg font-bold text-stone-800 dark:text-stone-100">מתכון חדש</h2>
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
          <p className="text-sm text-stone-600 dark:text-stone-300">
            הדביקו טקסט של מתכון או קישור לסרטון / אתר, הקלידו בקול, או צלמו עמוד מספר מתכונים.
          </p>

          <textarea
            value={input}
            onChange={(event) => setInput(event.target.value)}
            rows={7}
            autoFocus
            placeholder={"הדביקו כאן מתכון (שם, מצרכים, אופן הכנה) או קישור...\nhttps://www.instagram.com/reel/..."}
            className="w-full resize-y rounded-xl border border-amber-200 bg-white px-3 py-2 text-sm text-stone-700 outline-none focus:border-amber-400 dark:border-amber-900/50 dark:bg-stone-950 dark:text-stone-200"
          />

          {dictation.listening && (
            <p className="rounded-lg bg-rose-50 px-3 py-2 text-xs text-rose-700 dark:bg-rose-950/30 dark:text-rose-300">
              מקשיב... {dictation.interim || "הקריאו את המתכון: שם, מצרכים, אופן הכנה"}
            </p>
          )}

          <div className="grid grid-cols-3 gap-2">
            <button
              type="button"
              onClick={dictation.listening ? dictation.stop : dictation.start}
              className={`${actionButton} ${dictation.listening ? "animate-pulse !border-rose-500 !bg-rose-500 !text-white" : ""}`}
            >
              <Mic className="h-4 w-4" />
              {dictation.listening ? "עצור" : "הקלטה"}
            </button>
            <label className={actionButton}>
              <Camera className="h-4 w-4" />
              צילום
              <input type="file" accept="image/*" capture="environment" className="hidden" disabled={Boolean(busy)} onChange={handlePhoto} />
            </label>
            <label className={actionButton}>
              <ImageIcon className="h-4 w-4" />
              גלריה
              <input type="file" accept="image/*" className="hidden" disabled={Boolean(busy)} onChange={handlePhoto} />
            </label>
          </div>

          {busy && <p className="text-xs text-stone-600 dark:text-stone-300">{busy}</p>}
          {message && <p className="text-xs text-stone-600 dark:text-stone-300">{message}</p>}
          {dictation.error && <p className="text-xs text-rose-600 dark:text-rose-400">{dictation.error}</p>}

          <div className="flex flex-wrap items-center gap-x-4 gap-y-1 border-t border-dashed border-stone-200 pt-3 text-xs dark:border-stone-700">
            <button type="button" onClick={onImportChat} className="flex items-center gap-1 font-medium text-amber-700 hover:underline dark:text-amber-400">
              <FileUp className="h-3.5 w-3.5" />
              ייבוא מקובץ צ&apos;אט של וואטסאפ
            </button>
            <button type="button" onClick={onManual} className="font-medium text-stone-500 hover:underline dark:text-stone-400">
              למלא ידנית מאפס
            </button>
          </div>
        </div>

        <div className="shrink-0 border-t border-amber-100 bg-white p-4 dark:border-amber-950/30 dark:bg-stone-900">
          <button
            type="button"
            onClick={handleContinue}
            disabled={!input.trim() || Boolean(busy) || dictation.listening}
            className="w-full rounded-xl bg-amber-500 px-4 py-3 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-amber-600 disabled:opacity-50"
          >
            המשך לעריכה ושמירה
          </button>
        </div>
      </div>
    </div>
  );
}

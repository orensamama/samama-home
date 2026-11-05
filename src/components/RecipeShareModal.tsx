"use client";

import { useState, useSyncExternalStore } from "react";
import { Check, Copy, Mail, MessageCircle, Share2, X } from "lucide-react";

/**
 * "Share / export recipe": pick where the formatted text goes -- WhatsApp, the clipboard, or the
 * device's own share sheet (which includes e-mail where it's supported).
 */
export default function RecipeShareModal({ title, text, onClose }: { title: string; text: string; onClose: () => void }) {
  const [copied, setCopied] = useState(false);
  // False on the server and during hydration, then the real answer: no mismatch.
  const canNativeShare = useSyncExternalStore(
    () => () => {},
    () => typeof navigator.share === "function",
    () => false
  );

  async function copy() {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 2500);
    } catch {
      // Clipboard blocked: select the preview text so it can be copied by hand.
      document.getElementById("recipe-share-preview")?.focus();
    }
  }

  async function nativeShare() {
    try {
      await navigator.share({ title, text });
    } catch {
      // cancelled by the user: nothing to do
    }
  }

  const rowClass =
    "flex min-h-[52px] w-full items-center gap-3 rounded-xl border border-amber-100 bg-white px-4 py-3 text-right text-sm font-semibold text-stone-800 transition-colors hover:bg-amber-50 active:scale-[0.99] dark:border-amber-950/30 dark:bg-stone-900 dark:text-stone-100 dark:hover:bg-stone-800";

  return (
    <div className="fixed inset-0 z-[60] flex items-end justify-center bg-black/40 sm:items-center">
      <div className="flex max-h-[88dvh] w-full flex-col gap-3 overflow-y-auto rounded-t-3xl bg-white p-4 pb-[calc(1rem+env(safe-area-inset-bottom))] shadow-lg sm:max-w-md sm:rounded-3xl dark:bg-stone-900">
        <div className="flex items-center justify-between">
          <h2 className="flex items-center gap-2 text-base font-bold text-stone-800 dark:text-stone-100">
            <Share2 className="h-5 w-5 text-amber-500" />
            שיתוף / ייצוא מתכון
          </h2>
          <button type="button" onClick={onClose} aria-label="סגירה" className="rounded-full p-1.5 text-stone-400 hover:bg-stone-100 dark:hover:bg-stone-800">
            <X className="h-5 w-5" />
          </button>
        </div>

        <a href={`https://wa.me/?text=${encodeURIComponent(text)}`} target="_blank" rel="noopener noreferrer" className={rowClass}>
          <MessageCircle className="h-5 w-5 shrink-0 text-emerald-500" />
          <span className="flex-1">שליחה בוואטסאפ</span>
        </a>
        <button type="button" onClick={() => void copy()} className={rowClass}>
          {copied ? <Check className="h-5 w-5 shrink-0 text-emerald-500" /> : <Copy className="h-5 w-5 shrink-0 text-amber-500" />}
          <span className="flex-1">{copied ? "הועתק!" : "העתקת הטקסט"}</span>
        </button>
        {canNativeShare ? (
          <button type="button" onClick={() => void nativeShare()} className={rowClass}>
            <Mail className="h-5 w-5 shrink-0 text-sky-500" />
            <span className="flex-1">אימייל / שיתוף מערכת</span>
          </button>
        ) : (
          <a href={`mailto:?subject=${encodeURIComponent(title)}&body=${encodeURIComponent(text)}`} className={rowClass}>
            <Mail className="h-5 w-5 shrink-0 text-sky-500" />
            <span className="flex-1">שליחה באימייל</span>
          </a>
        )}

        <textarea
          id="recipe-share-preview"
          readOnly
          value={text}
          rows={8}
          onFocus={(event) => event.currentTarget.select()}
          className="w-full resize-none rounded-xl border border-stone-200 bg-stone-50 p-3 text-xs text-stone-600 outline-none dark:border-stone-700 dark:bg-stone-950 dark:text-stone-300"
        />
      </div>
    </div>
  );
}

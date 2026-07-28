"use client";

import { useState } from "react";
import { Check, Copy, MessageCircle, Share2 } from "lucide-react";

/**
 * A small "share this list" trigger: native share sheet (when supported --
 * covers WhatsApp and everything else installed on the device), a direct
 * WhatsApp deep link, and copy-to-clipboard. Text is built by the caller
 * (each screen knows its own data), this component only handles getting
 * it out to the user.
 */
export default function ShareMenu({
  text,
  label = "שיתוף",
  disabled = false,
}: {
  text: string;
  label?: string;
  disabled?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [copied, setCopied] = useState(false);
  const canNativeShare = typeof navigator !== "undefined" && typeof navigator.share === "function";

  async function handleNativeShare() {
    setOpen(false);
    try {
      await navigator.share({ text });
    } catch {
      // User cancelled the share sheet -- not an error.
    }
  }

  function handleWhatsApp() {
    setOpen(false);
    const url = `https://wa.me/?text=${encodeURIComponent(text)}`;
    window.open(url, "_blank", "noopener,noreferrer");
  }

  async function handleCopy() {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Clipboard API unavailable/denied -- nothing else we can do here.
    }
  }

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        disabled={disabled}
        className="flex items-center gap-1.5 rounded-xl border border-amber-200 px-3 py-2 text-sm font-medium text-amber-700 transition-colors hover:bg-amber-50 disabled:opacity-40 dark:border-amber-900/50 dark:text-amber-400 dark:hover:bg-stone-800"
      >
        <Share2 className="h-4 w-4" />
        {label}
      </button>

      {open && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
          <div className="absolute left-0 top-full z-50 mt-1.5 flex w-52 flex-col gap-0.5 rounded-xl border border-amber-100 bg-white p-1.5 shadow-lg dark:border-amber-950/40 dark:bg-stone-900">
            {canNativeShare && (
              <button
                type="button"
                onClick={handleNativeShare}
                className="flex items-center gap-2 rounded-lg px-2.5 py-2 text-sm text-stone-700 hover:bg-amber-50 dark:text-stone-200 dark:hover:bg-stone-800"
              >
                <Share2 className="h-4 w-4 shrink-0 text-amber-500" />
                שיתוף מהמכשיר
              </button>
            )}
            <button
              type="button"
              onClick={handleWhatsApp}
              className="flex items-center gap-2 rounded-lg px-2.5 py-2 text-sm text-stone-700 hover:bg-amber-50 dark:text-stone-200 dark:hover:bg-stone-800"
            >
              <MessageCircle className="h-4 w-4 shrink-0 text-emerald-500" />
              וואטסאפ
            </button>
            <button
              type="button"
              onClick={handleCopy}
              className="flex items-center gap-2 rounded-lg px-2.5 py-2 text-sm text-stone-700 hover:bg-amber-50 dark:text-stone-200 dark:hover:bg-stone-800"
            >
              {copied ? (
                <Check className="h-4 w-4 shrink-0 text-emerald-500" />
              ) : (
                <Copy className="h-4 w-4 shrink-0 text-amber-500" />
              )}
              {copied ? "הועתק!" : "העתקה ללוח"}
            </button>
          </div>
        </>
      )}
    </div>
  );
}

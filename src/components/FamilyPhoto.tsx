"use client";

import { useEffect, useState, useSyncExternalStore, type ChangeEvent } from "react";
import Image from "next/image";
import { Camera, LoaderCircle } from "lucide-react";
import SetupSqlButton from "@/components/SetupSqlButton";
import { supabase } from "@/lib/supabaseClient";

const SETTING_KEY = "family_photo_url";
const CACHE_KEY = "samama-home:family-photo-url";
const CACHE_EVENT = "samama-home:family-photo-change";
const MAX_SIDE = 900;
const MAX_INPUT_BYTES = 15 * 1024 * 1024;

// The chosen photo's URL is mirrored in localStorage so it shows instantly on
// the next visit. Read through useSyncExternalStore so server and first client
// render agree (both start from the bundled photo) and no hydration mismatch.
function subscribe(callback: () => void) {
  window.addEventListener(CACHE_EVENT, callback);
  window.addEventListener("storage", callback);
  return () => {
    window.removeEventListener(CACHE_EVENT, callback);
    window.removeEventListener("storage", callback);
  };
}

function readCachedUrl(): string | null {
  try {
    return window.localStorage.getItem(CACHE_KEY);
  } catch {
    return null;
  }
}

function writeCachedUrl(url: string) {
  try {
    window.localStorage.setItem(CACHE_KEY, url);
  } catch {
    // storage unavailable -- the photo just won't be cached
  }
  window.dispatchEvent(new Event(CACHE_EVENT));
}

/** Downscale to a reasonable size (phone photos are many MB) and re-encode as JPEG. */
async function resizeImage(file: File): Promise<Blob> {
  const bitmap = await createImageBitmap(file);
  const scale = Math.min(1, MAX_SIDE / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(bitmap.width * scale);
  canvas.height = Math.round(bitmap.height * scale);
  const context = canvas.getContext("2d");
  if (!context) throw new Error("canvas unavailable");
  context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  bitmap.close();
  const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/jpeg", 0.85));
  if (!blob) throw new Error("encode failed");
  return blob;
}

/**
 * The family portrait on the dashboard. A small camera button lets anyone pick
 * a new picture from the phone/computer; it's uploaded to Supabase storage and
 * saved in `app_settings`, so every device shows the new one.
 */
export default function FamilyPhoto() {
  const url = useSyncExternalStore(subscribe, readCachedUrl, () => null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [needsSetup, setNeedsSetup] = useState(false);

  // Pick up a photo changed from another device.
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const { data } = await supabase.from("app_settings").select("value").eq("key", SETTING_KEY).maybeSingle();
      if (!cancelled && data?.value && data.value !== readCachedUrl()) writeCachedUrl(data.value);
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  async function handleChange(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      setError("אפשר לבחור רק קובץ תמונה.");
      return;
    }
    if (file.size > MAX_INPUT_BYTES) {
      setError("התמונה גדולה מדי (מקסימום 15MB).");
      return;
    }

    setBusy(true);
    setError(null);
    setNeedsSetup(false);
    try {
      const blob = await resizeImage(file);
      const path = `family-${Date.now()}.jpg`;
      const { error: uploadError } = await supabase.storage
        .from("family-photo")
        .upload(path, blob, { contentType: "image/jpeg", upsert: true });
      if (uploadError) throw uploadError;

      const publicUrl = supabase.storage.from("family-photo").getPublicUrl(path).data.publicUrl;
      const { error: saveError } = await supabase
        .from("app_settings")
        .upsert({ key: SETTING_KEY, value: publicUrl, updated_at: new Date().toISOString() });
      if (saveError) throw saveError;

      writeCachedUrl(publicUrl);
    } catch (err) {
      console.error("[Supabase] עדכון תמונת משפחה:", err);
      setError("לא הצלחנו לשמור את התמונה. כנראה צריך להשלים הגדרה חד־פעמית במסד הנתונים.");
      setNeedsSetup(true);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-col items-center gap-2">
      <div className="relative -rotate-2 rounded-2xl border-[6px] border-white bg-white p-1 shadow-lg ring-1 ring-amber-100 dark:border-stone-800 dark:bg-stone-800 dark:ring-amber-950/40">
        <div className="relative h-40 w-40 overflow-hidden rounded-xl sm:h-48 sm:w-48">
          {url ? (
            // eslint-disable-next-line @next/next/no-img-element -- user-uploaded, arbitrary Supabase storage URL
            <img src={url} alt="משפחת סממה" className="h-full w-full object-cover" />
          ) : (
            <Image
              src="/family.jpg"
              alt="משפחת סממה"
              fill
              priority
              sizes="(min-width: 640px) 192px, 160px"
              className="object-cover"
            />
          )}
          {busy && (
            <div className="absolute inset-0 flex items-center justify-center bg-black/40">
              <LoaderCircle className="h-8 w-8 animate-spin text-white" />
            </div>
          )}
        </div>

        <label
          className={`absolute -bottom-3 -left-3 flex h-9 w-9 cursor-pointer items-center justify-center rounded-full bg-amber-500 text-white shadow-md transition-colors hover:bg-amber-600 active:scale-95 ${
            busy ? "pointer-events-none opacity-60" : ""
          }`}
          title="החלפת תמונה"
        >
          <Camera className="h-4 w-4" />
          <span className="sr-only">החלפת תמונת המשפחה</span>
          <input type="file" accept="image/*" className="hidden" disabled={busy} onChange={handleChange} />
        </label>
      </div>

      {error && (
        <div className="mt-2 flex max-w-xs flex-col items-center gap-2 text-center">
          <p className="text-xs text-rose-600 dark:text-rose-400">{error}</p>
          {needsSetup && <SetupSqlButton />}
        </div>
      )}
    </div>
  );
}

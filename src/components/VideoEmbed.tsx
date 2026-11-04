"use client";

import { ExternalLink } from "lucide-react";

/**
 * The original video player inside the recipe card (YouTube / Instagram /
 * TikTok / Vimeo / Facebook), with a plain link underneath in case a platform
 * refuses to be embedded.
 */
export default function VideoEmbed({ embedUrl, sourceUrl }: { embedUrl: string; sourceUrl?: string | null }) {
  const tall = /instagram\.com|tiktok\.com/.test(embedUrl);
  return (
    <div className="flex flex-col gap-1.5">
      <div
        className={`overflow-hidden rounded-2xl border border-amber-100 bg-black/5 dark:border-amber-950/30 ${
          tall ? "mx-auto h-[560px] w-full max-w-sm" : "aspect-video w-full"
        }`}
      >
        <iframe
          src={embedUrl}
          title="סרטון המתכון"
          loading="lazy"
          allow="autoplay; encrypted-media; picture-in-picture; fullscreen"
          allowFullScreen
          referrerPolicy="strict-origin-when-cross-origin"
          sandbox="allow-scripts allow-same-origin allow-popups allow-presentation allow-popups-to-escape-sandbox"
          className="h-full w-full border-0"
        />
      </div>
      {sourceUrl && (
        <a
          href={sourceUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="flex w-fit items-center gap-1 text-xs font-medium text-amber-600 hover:underline dark:text-amber-400"
        >
          <ExternalLink className="h-3 w-3" />
          פתיחה באתר המקור
        </a>
      )}
    </div>
  );
}

import { embedFromUrl } from "@/lib/recipeData";

// Looks up a shared recipe link (YouTube / Instagram / TikTok / a recipe site) on
// the server -- browsers can't read other sites' pages (CORS) -- and returns what
// the page itself says: its title, its description text, a picture, and, for
// recipe sites that publish schema.org/Recipe data, the ingredient lines and
// method exactly as written there. Nothing is rewritten or invented; when a site
// doesn't expose its text (Instagram often hides it) the fields come back empty.

const MAX_BYTES = 1_500_000;
const TIMEOUT_MS = 8000;
const MAX_REDIRECTS = 4;

type LinkInfo = {
  ok: boolean;
  url: string;
  title: string;
  description: string;
  image: string | null;
  embedUrl: string | null;
  platform: string | null;
  recipe: { ingredients: string[]; instructions: string; servings: number | null } | null;
  note?: string;
};

/** Refuse anything that isn't a public http(s) address (stops the server being used to probe its own network). */
function isPublicHttpUrl(url: URL): boolean {
  if (url.protocol !== "http:" && url.protocol !== "https:") return false;
  const host = url.hostname.toLowerCase();
  if (host === "localhost" || host.endsWith(".localhost") || host.endsWith(".local") || host.endsWith(".internal")) return false;
  if (host.includes(":")) return false; // IPv6 literals
  if (/^\d+\.\d+\.\d+\.\d+$/.test(host)) {
    const [a, b] = host.split(".").map(Number);
    if (a === 10 || a === 127 || a === 0 || a >= 224) return false;
    if (a === 169 && b === 254) return false;
    if (a === 172 && b >= 16 && b <= 31) return false;
    if (a === 192 && b === 168) return false;
    if (a === 100 && b >= 64 && b <= 127) return false;
  }
  return host.includes(".");
}

async function fetchPage(startUrl: URL): Promise<{ finalUrl: URL; html: string } | null> {
  let url = startUrl;
  const mobile = /instagram\.com|tiktok\.com|facebook\.com|fb\.watch/i.test(url.hostname);
  for (let hop = 0; hop <= MAX_REDIRECTS; hop++) {
    if (!isPublicHttpUrl(url)) return null;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
    try {
      const response = await fetch(url, {
        redirect: "manual",
        signal: controller.signal,
        headers: {
          // Social sites serve their preview tags (og:*) to link-preview crawlers.
          "User-Agent": mobile
            ? "facebookexternalhit/1.1 (+http://www.facebook.com/externalhit_uatext.php)"
            : "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36",
          "Accept-Language": "he-IL,he;q=0.9,en;q=0.8",
          Accept: "text/html,application/xhtml+xml",
          Cookie: "CONSENT=YES+1; SOCS=CAI",
        },
      });
      if (response.status >= 300 && response.status < 400) {
        const location = response.headers.get("location");
        if (!location) return null;
        url = new URL(location, url);
        continue;
      }
      if (!response.ok || !response.body) return null;

      const reader = response.body.getReader();
      const chunks: Uint8Array[] = [];
      let total = 0;
      while (total < MAX_BYTES) {
        const { done, value } = await reader.read();
        if (done) break;
        chunks.push(value);
        total += value.length;
      }
      reader.cancel().catch(() => {});
      const html = new TextDecoder("utf-8").decode(Buffer.concat(chunks));
      return { finalUrl: url, html };
    } catch {
      return null;
    } finally {
      clearTimeout(timer);
    }
  }
  return null;
}

function decodeEntities(value: string): string {
  return value
    .replace(/&#x([0-9a-f]+);/gi, (_m, hex: string) => String.fromCodePoint(parseInt(hex, 16)))
    .replace(/&#(\d+);/g, (_m, dec: string) => String.fromCodePoint(Number(dec)))
    .replace(/&quot;/g, '"')
    .replace(/&apos;|&#39;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&");
}

function metaContent(html: string, key: string): string {
  const patterns = [
    new RegExp(`<meta[^>]+(?:property|name)=["']${key}["'][^>]*content=["']([^"']*)["']`, "i"),
    new RegExp(`<meta[^>]+content=["']([^"']*)["'][^>]*(?:property|name)=["']${key}["']`, "i"),
  ];
  for (const pattern of patterns) {
    const match = html.match(pattern);
    if (match) return decodeEntities(match[1]).trim();
  }
  return "";
}

function textOf(value: unknown): string {
  if (typeof value === "string") return decodeEntities(value).replace(/<[^>]+>/g, " ").replace(/[ \t]+/g, " ").trim();
  return "";
}

function instructionsOf(value: unknown): string[] {
  if (!value) return [];
  if (typeof value === "string") return textOf(value).split(/\n+/).map((s) => s.trim()).filter(Boolean);
  if (Array.isArray(value)) return value.flatMap(instructionsOf);
  if (typeof value === "object") {
    const node = value as Record<string, unknown>;
    if (node.itemListElement) return instructionsOf(node.itemListElement);
    return instructionsOf(node.text ?? node.name);
  }
  return [];
}

function imageOf(value: unknown): string | null {
  if (typeof value === "string") return value;
  if (Array.isArray(value)) return imageOf(value[0]);
  if (value && typeof value === "object") return imageOf((value as Record<string, unknown>).url);
  return null;
}

function findRecipeNode(node: unknown): Record<string, unknown> | null {
  if (!node || typeof node !== "object") return null;
  if (Array.isArray(node)) {
    for (const item of node) {
      const found = findRecipeNode(item);
      if (found) return found;
    }
    return null;
  }
  const record = node as Record<string, unknown>;
  const type = record["@type"];
  if (type === "Recipe" || (Array.isArray(type) && type.includes("Recipe"))) return record;
  return findRecipeNode(record["@graph"]);
}

function recipeFromJsonLd(html: string): { title: string; image: string | null; description: string; recipe: LinkInfo["recipe"] } | null {
  for (const match of html.matchAll(/<script[^>]+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi)) {
    try {
      const node = findRecipeNode(JSON.parse(match[1]));
      if (!node) continue;
      const ingredients = Array.isArray(node.recipeIngredient)
        ? (node.recipeIngredient as unknown[]).map(textOf).filter(Boolean)
        : [];
      const yieldText = Array.isArray(node.recipeYield) ? String(node.recipeYield[0]) : String(node.recipeYield ?? "");
      const servings = Number(yieldText.match(/\d+/)?.[0]);
      return {
        title: textOf(node.name),
        image: imageOf(node.image),
        description: textOf(node.description),
        recipe: {
          ingredients,
          instructions: instructionsOf(node.recipeInstructions).join("\n"),
          servings: Number.isFinite(servings) && servings > 0 ? servings : null,
        },
      };
    } catch {
      // malformed JSON-LD block: try the next one
    }
  }
  return null;
}

/** YouTube keeps the full description in the page's player JSON. */
function youtubeDescription(html: string): string {
  const match = html.match(/"shortDescription":"((?:[^"\\]|\\.)*)"/);
  if (!match) return "";
  try {
    return (JSON.parse(`"${match[1]}"`) as string).trim();
  } catch {
    return "";
  }
}

export async function GET(request: Request) {
  const target = new URL(request.url).searchParams.get("url") ?? "";
  let parsed: URL;
  try {
    parsed = new URL(target);
  } catch {
    return Response.json({ ok: false, note: "קישור לא תקין" }, { status: 400 });
  }
  if (!isPublicHttpUrl(parsed)) return Response.json({ ok: false, note: "קישור לא נתמך" }, { status: 400 });

  const page = await fetchPage(parsed);
  const finalUrl = page?.finalUrl ?? parsed;
  const embed = embedFromUrl(finalUrl.toString()) ?? embedFromUrl(target);

  const info: LinkInfo = {
    ok: Boolean(page),
    url: finalUrl.toString(),
    title: "",
    description: "",
    image: null,
    embedUrl: embed?.embedUrl ?? null,
    platform: embed?.platform ?? null,
    recipe: null,
  };

  if (page) {
    const html = page.html;
    const ld = recipeFromJsonLd(html);
    info.title = ld?.title || metaContent(html, "og:title") || metaContent(html, "twitter:title") || textOf(html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1]);
    info.image = ld?.image || metaContent(html, "og:image") || metaContent(html, "twitter:image") || null;
    info.description =
      (embed?.platform === "youtube" ? youtubeDescription(html) : "") ||
      ld?.description ||
      metaContent(html, "og:description") ||
      metaContent(html, "description");
    info.recipe = ld?.recipe && (ld.recipe.ingredients.length > 0 || ld.recipe.instructions) ? ld.recipe : null;
    if (!info.description && !info.recipe && embed) {
      info.note = "האתר לא חושף את טקסט הפוסט. הנגן הוטמע - אפשר להעתיק את המתכון לשדות ידנית.";
    }
  } else {
    info.note = "לא הצלחנו לקרוא את הקישור (אולי דורש התחברות). הקישור והנגן נשמרו.";
  }

  return Response.json(info, { headers: { "Cache-Control": "private, max-age=300" } });
}

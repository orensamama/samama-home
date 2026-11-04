// Samama Cookbook: types and pure helpers (text parsing, WhatsApp chat import,
// duplicate detection, portion scaling, search). No imports, so it's testable in
// Node. Golden rule of everything here: the family's own wording and quantities
// are never rewritten -- text is only SPLIT into fields, and quantities are only
// scaled at display time.

export type Recipe = {
  id: string;
  title: string;
  /** Tag names -- a recipe can belong to several categories at once. */
  categories: string[];
  /** How many portions the recipe's quantities are written for (null = not stated). */
  servings: number | null;
  /** The original ingredient lines, untouched. */
  ingredients: string[];
  instructions: string;
  tips: string;
  /** Text fetched from the linked video/site (or pasted caption). */
  description: string;
  source_url: string | null;
  embed_url: string | null;
  image_url: string | null;
  /** The raw text this recipe was imported from, kept verbatim. */
  original_text: string | null;
  is_favorite: boolean;
  created_at: string;
  updated_at: string;
};

export type RecipeTag = { id: string; name: string; sort_order: number };

/** A recipe before it's saved (what the editor works on). */
export type RecipeDraft = Omit<Recipe, "id" | "created_at" | "updated_at" | "is_favorite"> & { is_favorite?: boolean };

export const RECIPE_ORDER = { column: "created_at", ascending: false } as const;
export const TAG_ORDER = { column: "sort_order", ascending: true } as const;

export const SUGGESTED_TAGS = [
  "בשרים",
  "עוף",
  "דגים",
  "מרקים",
  "סלטים",
  "תוספות",
  "מאפים ולחמים",
  "עוגות וקינוחים",
  "ארוחת שישי",
  "חגים",
  "מהיר ופשוט",
  "ילדים",
  "צמחוני",
  "ללא גלוטן",
];

export function emptyDraft(): RecipeDraft {
  return {
    title: "",
    categories: [],
    servings: null,
    ingredients: [],
    instructions: "",
    tips: "",
    description: "",
    source_url: null,
    embed_url: null,
    image_url: null,
    original_text: null,
  };
}

// ---------------------------------------------------------------------------
// Portion scaler
// ---------------------------------------------------------------------------

const GLYPH_VALUES: Record<string, number> = { "½": 0.5, "¼": 0.25, "¾": 0.75, "⅓": 1 / 3, "⅔": 2 / 3, "⅛": 0.125 };
const WORD_FRACTIONS: Record<string, number> = { חצי: 0.5, רבע: 0.25, שליש: 1 / 3 };

// Not an ingredient quantity: oven temperature, times, percentages.
const NOT_A_QUANTITY_AFTER = /^\s*(?:°|מעלות|דקות|דקה|שעות|שעה|שניות|%|אחוז)/;

// "1 1/2", "3/4", "2.5", "2,5", "2½", "½", or the Hebrew words חצי/רבע/שליש.
const QUANTITY_TOKEN =
  /(\d+\s+\d\/\d|\d+\/\d+|\d+(?:[.,]\d+)?)\s?([½¼¾⅓⅔⅛])?|([½¼¾⅓⅔⅛])|(?<![\p{L}\d])(חצי|רבע|שליש)(?![\p{L}\d])/gu;

function parseQuantity(match: RegExpMatchArray): number | null {
  const [, numeric, glyphAfterNumber, glyphAlone, word] = match;
  if (word) return WORD_FRACTIONS[word] ?? null;
  if (glyphAlone) return GLYPH_VALUES[glyphAlone] ?? null;
  if (!numeric) return null;
  let value: number;
  const mixed = numeric.match(/^(\d+)\s+(\d)\/(\d)$/);
  const fraction = numeric.match(/^(\d+)\/(\d+)$/);
  if (mixed) value = Number(mixed[1]) + Number(mixed[2]) / Number(mixed[3]);
  else if (fraction) value = Number(fraction[2]) === 0 ? NaN : Number(fraction[1]) / Number(fraction[2]);
  else value = Number(numeric.replace(",", "."));
  if (glyphAfterNumber) value += GLYPH_VALUES[glyphAfterNumber] ?? 0;
  return Number.isFinite(value) ? value : null;
}

/** 1.5 -> "1½", 0.25 -> "¼", 2 -> "2", 2.37 -> "2.4". */
export function formatQuantity(value: number): string {
  if (value <= 0) return "0";
  if (value >= 10) return String(Math.round(value)); // grams, ml...: whole numbers read best
  const whole = Math.floor(value + 1e-9);
  const rest = value - whole;
  // The nearest kitchen fraction, if one is close enough; otherwise one decimal.
  const steps: [number, string][] = [
    [0, ""],
    [0.25, "¼"],
    [1 / 3, "⅓"],
    [0.5, "½"],
    [2 / 3, "⅔"],
    [0.75, "¾"],
    [1, ""],
  ];
  let best = steps[0];
  for (const step of steps) if (Math.abs(rest - step[0]) < Math.abs(rest - best[0])) best = step;
  if (Math.abs(rest - best[0]) <= 0.07) {
    const base = best[0] === 1 ? whole + 1 : whole;
    return best[1] === "" ? String(base) : `${base > 0 ? base : ""}${best[1]}`;
  }
  return String(Math.round(value * 10) / 10);
}

// "כוס וחצי", "כף ורבע": a unit plus a spoken fraction -- we can't rewrite those safely.
const SPOKEN_COMPOUND = /(כוס|כוסות|כף|כפות|כפית|כפיות|ליטר|קילו|ק"ג|ק״ג|חבילה|חבילות)\s+ו(חצי|רבע|שליש)/;

/**
 * Scales every quantity in an ingredient line by `factor`, leaving all other
 * words exactly as written. At factor 1 the original text is returned
 * untouched. `scaled` is false when the line has quantities we can't safely
 * rescale ("כוס וחצי") so the UI can flag it instead of showing a wrong number.
 */
export function scaleIngredientLine(line: string, factor: number): { text: string; scaled: boolean } {
  if (!Number.isFinite(factor) || Math.abs(factor - 1) < 1e-9) return { text: line, scaled: true };
  if (SPOKEN_COMPOUND.test(line)) return { text: line, scaled: false };
  if (/:\s*$/.test(line)) return { text: line, scaled: true }; // a section heading like "לבצק:"

  let changed = false;
  const text = line.replace(QUANTITY_TOKEN, (matched: string, ...args: unknown[]) => {
    const offset = args[args.length - 2] as number;
    const after = line.slice(offset + matched.length);
    if (NOT_A_QUANTITY_AFTER.test(after)) return matched;
    const groups = args.slice(0, 4) as (string | undefined)[];
    const parsed = parseQuantity([matched, ...groups] as unknown as RegExpMatchArray);
    if (parsed === null || parsed <= 0) return matched;
    changed = true;
    const trailing = /\s$/.test(matched) ? " " : "";
    return formatQuantity(parsed * factor) + trailing;
  });
  // A scaled 1 reads better with the singular ("1 כוסות" -> "1 כוס").
  const SINGULAR: Record<string, string> = { כוסות: "כוס", כפות: "כף", כפיות: "כפית", ביצים: "ביצה" };
  const singular = changed
    ? text.replace(/(^|\s)1 (כוסות|כפות|כפיות|ביצים)/g, (_m, lead: string, unit: string) => `${lead}1 ${SINGULAR[unit]}`)
    : text;
  return { text: singular, scaled: true };
}

// ---------------------------------------------------------------------------
// Splitting free text into recipe fields (verbatim -- nothing is reworded)
// ---------------------------------------------------------------------------

export type ParsedRecipeText = {
  title: string;
  ingredients: string[];
  instructions: string;
  tips: string;
  servings: number | null;
  /** True when explicit headings (מצרכים / אופן הכנה ...) were found. */
  confident: boolean;
};

const INVISIBLE = /[‎‏‪-‮⁦-⁩﻿]/g;
const HEADING_DECOR = /^[\s*_~#>\-–—:•·]+|[\s*_~:\-–—]+$/g;

const INGREDIENTS_HEADING = /^(המצרכים|מצרכים|המרכיבים|מרכיבים|הרכיבים|רכיבים|החומרים|חומרים|ingredients)(?=$|[\s:])/i;
const PREPARATION_HEADING =
  /^(אופן ההכנה|אופן הכנה|הוראות ההכנה|הוראות הכנה|דרך ההכנה|דרך הכנה|שלבי ההכנה|שלבי הכנה|ההכנה|הכנה|instructions|directions|method|preparation)(?=$|[\s:])/i;
const TIPS_HEADING = /^(טיפים|טיפ|הערות|הערה|דגשים|חשוב לדעת|טיפים והערות)(?=$|[\s:])/;

// A line that opens with a quantity or a measuring word -- looks like an ingredient.
const QUANTITY_LINE =
  /^[\s\-•*·–—]*(?:\d|[½¼¾⅓⅔⅛]|חצי\b|רבע\b|שליש\b|כוס|כוסות|כף|כפות|כפית|כפיות|קורט|קילו|גרם|חבילה|שן\b|שיני|מעט|קצת|ליטר|מ"ל|מ״ל|פרוסות|יחידה|יחידות)/;

const SERVINGS_PATTERNS: RegExp[] = [
  /(?:(?<![\p{L}])ל|עבור\s|כמות[:\s]+|מנות[:\s]+)[-\s]?(\d{1,2})(?!\d)\s*(?:מנות|סועדים|אנשים|יחידות|עוגיות|פרוסות)/u,
  /(?:מנות|סועדים|כמות)[:\s]+(\d{1,2})(?!\d)/u,
  /(?<!\d)(\d{1,2})\s*(?:מנות|סועדים|סועדות|אנשים)/u,
];

function cleanLine(line: string): string {
  return line.replace(INVISIBLE, "").replace(/\s+$/g, "");
}

function stripListMarker(line: string): string {
  // Bullets and "1." / "1)" numbering (but not "1 ביצה": a bare number is a quantity).
  return line.replace(/^[\s\-•*·–—]+/, "").replace(/^\d{1,2}[.)]\s+/, "").trim();
}

function headingOf(line: string): { type: "ingredients" | "preparation" | "tips"; rest: string } | null {
  const bare = line.replace(HEADING_DECOR, "");
  const candidates: [RegExp, "ingredients" | "preparation" | "tips"][] = [
    [INGREDIENTS_HEADING, "ingredients"],
    [PREPARATION_HEADING, "preparation"],
    [TIPS_HEADING, "tips"],
  ];
  for (const [pattern, type] of candidates) {
    const match = bare.match(pattern);
    if (!match) continue;
    // A heading is short, or has a colon right after the keyword; a long sentence that
    // merely starts with "הכנה ..." is not one.
    const remainder = bare.slice(match[0].length).replace(/^[\s:：\-–—*_]+/, "");
    const hasColon = /^[\s*_]*:/.test(bare.slice(match[0].length)) || /:\s*[*_]*$/.test(line.trim());
    if (remainder === "" || hasColon) return { type, rest: remainder };
  }
  return null;
}

export function parseServings(text: string): number | null {
  for (const pattern of SERVINGS_PATTERNS) {
    const match = text.match(pattern);
    if (match) {
      const value = Number(match[1]);
      if (value >= 1 && value <= 99) return value;
    }
  }
  return null;
}

export function parseRecipeText(rawText: string): ParsedRecipeText {
  const lines = rawText.split(/\r?\n/).map(cleanLine);
  let section: "pre" | "ingredients" | "preparation" | "tips" = "pre";
  let sawHeading = false;
  const pre: string[] = [];
  const buckets = { ingredients: [] as string[], preparation: [] as string[], tips: [] as string[] };

  for (const line of lines) {
    if (!line.trim()) {
      if (section === "preparation" || section === "tips") buckets[section].push("");
      continue;
    }
    const heading = headingOf(line.trim());
    if (heading) {
      sawHeading = true;
      section = heading.type;
      if (heading.rest) buckets[heading.type].push(heading.rest);
      continue;
    }
    if (section === "pre") pre.push(line);
    else buckets[section].push(line);
  }

  let title = "";
  let preLines = pre.filter((line) => line.trim());
  // First meaningful line is the title (unless it's a link or very long).
  if (preLines.length > 0 && !/^https?:\/\//i.test(preLines[0].trim()) && preLines[0].trim().length <= 90) {
    title = preLines[0].replace(HEADING_DECOR, "").trim();
    preLines = preLines.slice(1);
  }

  let ingredients = buckets.ingredients.map(stripListMarker).filter(Boolean);
  let instructions = buckets.preparation.join("\n").trim();
  const tips = buckets.tips.join("\n").trim();

  if (!sawHeading || (ingredients.length === 0 && instructions === "")) {
    // No headings: look for a run of quantity-looking lines (the ingredients), the rest is the method.
    const rest = preLines.length > 0 ? preLines : lines.filter((line) => line.trim());
    const body = title && preLines.length === 0 ? rest.slice(1) : rest;
    const isIngredient = body.map((line) => line.length <= 80 && QUANTITY_LINE.test(line));
    const count = isIngredient.filter(Boolean).length;
    if (count >= 3 && count / Math.max(body.length, 1) >= 0.4) {
      ingredients = body.filter((_, index) => isIngredient[index]).map(stripListMarker);
      instructions = body.filter((_, index) => !isIngredient[index]).join("\n").trim();
    } else {
      instructions = body.join("\n").trim();
    }
  } else if (preLines.length > 0 && instructions === "") {
    instructions = preLines.join("\n").trim();
  }

  // A single "ביצים, קמח, סוכר" line is several ingredients written inline.
  if (ingredients.length === 1 && (ingredients[0].match(/,/g) ?? []).length >= 2) {
    ingredients = ingredients[0].split(",").map((part) => part.trim()).filter(Boolean);
  }

  return {
    title,
    ingredients,
    instructions,
    tips,
    servings: parseServings(rawText),
    confident: sawHeading && ingredients.length > 0,
  };
}

// ---------------------------------------------------------------------------
// Links: video embeds
// ---------------------------------------------------------------------------

export type EmbedInfo = { embedUrl: string; platform: "youtube" | "instagram" | "tiktok" | "vimeo" | "facebook" };

export function extractUrls(text: string): string[] {
  return Array.from(text.matchAll(/https?:\/\/[^\s<>"')\]]+/gi), (match) => match[0].replace(/[.,;!?]+$/, ""));
}

/** The embeddable player URL for a video link, or null when it isn't one we can embed. */
export function embedFromUrl(rawUrl: string): EmbedInfo | null {
  let url: URL;
  try {
    url = new URL(rawUrl);
  } catch {
    return null;
  }
  const host = url.hostname.replace(/^(www|m|mobile)\./, "");
  const path = url.pathname;

  if (host === "youtu.be") {
    const id = path.split("/")[1];
    return id ? { platform: "youtube", embedUrl: `https://www.youtube-nocookie.com/embed/${id}` } : null;
  }
  if (host === "youtube.com" || host === "music.youtube.com") {
    const id = url.searchParams.get("v") ?? path.match(/^\/(?:shorts|embed|live)\/([\w-]{6,})/)?.[1];
    return id ? { platform: "youtube", embedUrl: `https://www.youtube-nocookie.com/embed/${id}` } : null;
  }
  if (host === "instagram.com") {
    const match = path.match(/^\/(?:[\w.]+\/)?(reel|reels|p|tv)\/([\w-]+)/);
    if (match) {
      const kind = match[1] === "reels" ? "reel" : match[1];
      return { platform: "instagram", embedUrl: `https://www.instagram.com/${kind}/${match[2]}/embed` };
    }
    return null;
  }
  if (host === "tiktok.com") {
    const id = path.match(/\/video\/(\d+)/)?.[1];
    return id ? { platform: "tiktok", embedUrl: `https://www.tiktok.com/embed/v2/${id}` } : null;
  }
  if (host === "vimeo.com") {
    const id = path.match(/^\/(\d+)/)?.[1];
    return id ? { platform: "vimeo", embedUrl: `https://player.vimeo.com/video/${id}` } : null;
  }
  if (host === "facebook.com" || host === "fb.watch") {
    if (host === "fb.watch" || /\/(videos|reel|watch)\b/.test(path)) {
      return {
        platform: "facebook",
        embedUrl: `https://www.facebook.com/plugins/video.php?href=${encodeURIComponent(rawUrl)}&show_text=false`,
      };
    }
  }
  return null;
}

/** For duplicate detection: the same video with different tracking params is the same link. */
export function normalizeUrl(rawUrl: string): string {
  try {
    const url = new URL(rawUrl);
    const host = url.hostname.replace(/^(www|m|mobile)\./, "");
    const keep = host.includes("youtube") ? url.searchParams.get("v") : null;
    return `${host}${url.pathname.replace(/\/$/, "")}${keep ? `?v=${keep}` : ""}`.toLowerCase();
  } catch {
    return rawUrl.trim().toLowerCase();
  }
}

// ---------------------------------------------------------------------------
// WhatsApp chat export (_chat.txt)
// ---------------------------------------------------------------------------

export type ChatMessage = { date: string | null; sender: string | null; text: string };

// Android: "12/03/2023, 14:05 - Name: text"   iOS: "[12/03/2023, 14:05:33] Name: text"
const CHAT_LINE =
  /^\[?(\d{1,2}[./]\d{1,2}[./]\d{2,4}),?\s+\d{1,2}:\d{2}(?::\d{2})?(?:\s?[APap][Mm])?\]?\s*(?:[-–]\s*)?(.*)$/;

const MEDIA_PLACEHOLDER =
  /^(?:<.*(?:omitted|הושמט).*>|.*\b(?:image|video|audio|sticker|GIF|document) omitted\b.*|.*(?:התמונה|הסרטון|הקובץ|האודיו|הסטיקר) הושמט.*)$/i;

function toIsoDate(raw: string): string | null {
  const parts = raw.split(/[./]/).map(Number);
  if (parts.length !== 3 || parts.some((p) => !Number.isFinite(p))) return null;
  let [day, month, year] = parts;
  if (year < 100) year += 2000;
  if (month > 12 && day <= 12) [day, month] = [month, day];
  if (month < 1 || month > 12 || day < 1 || day > 31) return null;
  return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

export function parseWhatsAppChat(raw: string): ChatMessage[] {
  const messages: ChatMessage[] = [];
  let current: ChatMessage | null = null;

  for (const rawLine of raw.replace(INVISIBLE, "").split(/\r?\n/)) {
    const match = rawLine.match(CHAT_LINE);
    if (match) {
      if (current) messages.push(current);
      const body = match[2];
      const colon = body.indexOf(": ");
      if (colon === -1) {
        current = null; // system message ("messages are encrypted", "X joined"...)
        continue;
      }
      const text = body.slice(colon + 2);
      current = MEDIA_PLACEHOLDER.test(text.trim())
        ? null
        : { date: toIsoDate(match[1]), sender: body.slice(0, colon).trim() || null, text };
    } else if (current) {
      current.text += `\n${rawLine}`;
    }
  }
  if (current) messages.push(current);
  return messages;
}

export type ChatRecipeCandidate = {
  /** Where it came from in the chat, for the review list. */
  sender: string | null;
  date: string | null;
  kind: "text" | "link";
  /** The message verbatim. */
  original: string;
  /** Text recipes are split here; for links this holds the caption. */
  parsed: ParsedRecipeText;
  url: string | null;
  /** Looks like a recipe but the fields couldn't be separated cleanly -- review it. */
  needsReview: boolean;
};

/** Does this message read like a recipe (rather than chit-chat)? */
export function looksLikeRecipeText(text: string): boolean {
  const body = text.replace(/https?:\/\/\S+/gi, "").trim();
  if (body.length < 60) return false;
  const lines = body.split("\n").map((l) => l.trim()).filter(Boolean);
  const hasHeading = lines.some((line) => {
    const heading = headingOf(line);
    return heading && (heading.type === "ingredients" || heading.type === "preparation");
  });
  const quantityLines = lines.filter((line) => line.length <= 80 && QUANTITY_LINE.test(line)).length;
  return hasHeading || quantityLines >= 4;
}

const VIDEO_OR_RECIPE_HOSTS =
  /(youtube\.com|youtu\.be|instagram\.com|tiktok\.com|vimeo\.com|facebook\.com|fb\.watch)/i;

/** Picks the recipe-looking messages (text recipes and shared links) out of a chat export. */
export function extractChatRecipes(raw: string): ChatRecipeCandidate[] {
  const out: ChatRecipeCandidate[] = [];
  for (const message of parseWhatsAppChat(raw)) {
    const text = message.text.trim();
    if (!text) continue;
    const urls = extractUrls(text);

    if (looksLikeRecipeText(text)) {
      const parsed = parseRecipeText(text.replace(/https?:\/\/\S+/gi, "").trim());
      out.push({
        sender: message.sender,
        date: message.date,
        kind: "text",
        original: text,
        parsed,
        url: urls[0] ?? null,
        needsReview: !parsed.confident || parsed.title === "",
      });
      continue;
    }
    const link = urls.find((url) => VIDEO_OR_RECIPE_HOSTS.test(url)) ?? null;
    if (link) {
      const caption = text.replace(/https?:\/\/\S+/gi, "").trim();
      out.push({
        sender: message.sender,
        date: message.date,
        kind: "link",
        original: text,
        parsed: { title: "", ingredients: [], instructions: "", tips: "", servings: null, confident: false },
        url: link,
        needsReview: caption.length === 0,
      });
    }
  }
  return out;
}

// ---------------------------------------------------------------------------
// Duplicates
// ---------------------------------------------------------------------------

export function normalizeText(value: string): string {
  return value
    .toLowerCase()
    .replace(INVISIBLE, "")
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function ingredientSet(lines: string[]): Set<string> {
  return new Set(lines.map(normalizeText).filter(Boolean));
}

function jaccard(a: Set<string>, b: Set<string>): number {
  if (a.size === 0 || b.size === 0) return 0;
  let shared = 0;
  for (const item of a) if (b.has(item)) shared++;
  return shared / (a.size + b.size - shared);
}

export type DuplicateMatch = {
  existing: Recipe;
  reason: "same-link" | "same-title" | "same-ingredients";
  /** Title, ingredients and method are all the same: nothing new to keep. */
  identical: boolean;
};

export function findDuplicate(candidate: RecipeDraft, existing: Recipe[]): DuplicateMatch | null {
  const title = normalizeText(candidate.title);
  const url = candidate.source_url ? normalizeUrl(candidate.source_url) : null;
  const candIngredients = ingredientSet(candidate.ingredients);

  for (const recipe of existing) {
    let reason: DuplicateMatch["reason"] | null = null;
    if (url && recipe.source_url && normalizeUrl(recipe.source_url) === url) reason = "same-link";
    else if (title && normalizeText(recipe.title) === title) reason = "same-title";
    else if (candIngredients.size >= 3 && jaccard(candIngredients, ingredientSet(recipe.ingredients)) >= 0.8)
      reason = "same-ingredients";
    if (!reason) continue;

    const identical =
      normalizeText(recipe.title) === title &&
      jaccard(candIngredients, ingredientSet(recipe.ingredients)) === 1 &&
      normalizeText(recipe.instructions) === normalizeText(candidate.instructions);
    return { existing: recipe, reason, identical };
  }
  return null;
}

/** Existing recipe + a newer import: fills what's missing, never overwrites what's there, unions the tags. */
export function mergeIntoExisting(existing: Recipe, incoming: RecipeDraft): Partial<Recipe> {
  return {
    categories: Array.from(new Set([...existing.categories, ...incoming.categories])),
    servings: existing.servings ?? incoming.servings,
    ingredients: existing.ingredients.length > 0 ? existing.ingredients : incoming.ingredients,
    instructions: existing.instructions || incoming.instructions,
    tips: existing.tips || incoming.tips,
    description: existing.description || incoming.description,
    source_url: existing.source_url ?? incoming.source_url,
    embed_url: existing.embed_url ?? incoming.embed_url,
    image_url: existing.image_url ?? incoming.image_url,
  };
}

/** Existing recipe + a newer import: the import's content wins wherever it has any, the tags are united. */
export function replaceWithNewer(existing: Recipe, incoming: RecipeDraft): Partial<Recipe> {
  return {
    title: incoming.title || existing.title,
    categories: Array.from(new Set([...existing.categories, ...incoming.categories])),
    servings: incoming.servings ?? existing.servings,
    ingredients: incoming.ingredients.length > 0 ? incoming.ingredients : existing.ingredients,
    instructions: incoming.instructions || existing.instructions,
    tips: incoming.tips || existing.tips,
    description: incoming.description || existing.description,
    source_url: incoming.source_url ?? existing.source_url,
    embed_url: incoming.embed_url ?? existing.embed_url,
    image_url: incoming.image_url ?? existing.image_url,
    original_text: incoming.original_text ?? existing.original_text,
  };
}

// ---------------------------------------------------------------------------
// Search
// ---------------------------------------------------------------------------

/** "ביצה" and "ביצים" should find each other: drop one plural/feminine ending. */
export function stemHebrew(word: string): string {
  const w = normalizeText(word);
  if (w.length <= 3) return w;
  return w.replace(/(ים|ות|ה|ת|י)$/, "");
}

export type RecipeSearch = {
  text: string;
  /** Recipes must carry ALL of these tags. */
  tags: string[];
  /** "What I have at home": comma/newline separated ingredient names. */
  have: string;
};

export type RecipeMatch = { recipe: Recipe; haveCount: number; total: number };

export function searchRecipes(recipes: Recipe[], search: RecipeSearch): RecipeMatch[] {
  const tokens = normalizeText(search.text).split(" ").filter(Boolean);
  const haveItems = search.have
    .split(/[,\n،;]+/)
    .map((item) => stemHebrew(item))
    .filter((item) => item.length >= 2);

  const matches: RecipeMatch[] = [];
  for (const recipe of recipes) {
    if (search.tags.length > 0 && !search.tags.every((tag) => recipe.categories.includes(tag))) continue;

    if (tokens.length > 0) {
      const haystack = normalizeText(
        [recipe.title, recipe.categories.join(" "), recipe.ingredients.join(" "), recipe.instructions, recipe.tips, recipe.description].join(" ")
      );
      if (!tokens.every((token) => haystack.includes(token))) continue;
    }

    let haveCount = 0;
    if (haveItems.length > 0) {
      const lines = recipe.ingredients.map(normalizeText);
      haveCount = lines.filter((line) => haveItems.some((item) => line.includes(item))).length;
      if (haveCount === 0) continue;
    }
    matches.push({ recipe, haveCount, total: recipe.ingredients.length });
  }

  if (haveItems.length > 0) {
    // Closest to cookable first: highest share of ingredients on hand, then fewest missing.
    matches.sort(
      (a, b) =>
        b.haveCount / Math.max(b.total, 1) - a.haveCount / Math.max(a.total, 1) ||
        a.total - a.haveCount - (b.total - b.haveCount)
    );
  } else if (tokens.length > 0) {
    const titleHits = (match: RecipeMatch) => tokens.filter((token) => normalizeText(match.recipe.title).includes(token)).length;
    matches.sort((a, b) => titleHits(b) - titleHits(a));
  }
  return matches;
}

/** Every tag in use: the family's defined tags plus any a recipe carries. */
export function collectTags(defined: RecipeTag[], recipes: Recipe[]): string[] {
  const names = new Set(defined.map((tag) => tag.name));
  for (const recipe of recipes) for (const tag of recipe.categories) names.add(tag);
  const order = new Map(defined.map((tag, index) => [tag.name, index]));
  return Array.from(names).sort(
    (a, b) => (order.get(a) ?? 9999) - (order.get(b) ?? 9999) || a.localeCompare(b, "he")
  );
}

/** A draft from pasted / dictated / scanned text: split into fields as written, original kept verbatim. */
export function draftFromText(text: string): RecipeDraft {
  const parsed = parseRecipeText(text);
  return {
    ...emptyDraft(),
    title: parsed.title,
    ingredients: parsed.ingredients,
    instructions: parsed.instructions,
    tips: parsed.tips,
    servings: parsed.servings,
    original_text: text.trim(),
  };
}

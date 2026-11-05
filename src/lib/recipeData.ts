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

/**
 * A simple, readable amount: whole numbers from 10 up, halves from 1 to 10 ("1.5",
 * "2", "2.5"), and a single fraction glyph below 1 ("¼", "½", "¾"). A glyph is never
 * placed next to digits: in a right-to-left line "42¾" is drawn as "¾42".
 */
export function formatQuantity(value: number): string {
  if (!(value > 0)) return "0";
  if (value >= 10) return String(Math.round(value)); // grams, ml...: whole numbers read best
  if (value >= 1) {
    const halves = Math.round(value * 2) / 2;
    return String(halves);
  }
  const steps: [number, string][] = [
    [0.25, "¼"],
    [1 / 3, "⅓"],
    [0.5, "½"],
    [2 / 3, "⅔"],
    [0.75, "¾"],
    [1, "1"],
  ];
  let best = steps[0];
  for (const step of steps) if (Math.abs(value - step[0]) < Math.abs(value - best[0])) best = step;
  // Smaller than a quarter: a decimal is clearer than a made-up fraction.
  return Math.abs(value - best[0]) <= 0.1 ? best[1] : String(Math.round(value * 10) / 10);
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
  /** The dish name only: no view counts, creator names, hashtags or caption text. */
  title: string;
  ingredients: string[];
  instructions: string;
  tips: string;
  /** Text before the first heading beyond the title (a caption, a story): kept as notes. */
  intro: string;
  servings: number | null;
  /** True when explicit headings (מצרכים / אופן הכנה ...) were found. */
  confident: boolean;
};

const INVISIBLE = /[‎‏‪-‮⁦-⁩﻿]/g;
const EMOJI = /[\p{Extended_Pictographic}\u{FE0F}\u{200D}\u{20E3}]/gu;
const EMOJI_ONE = /[\p{Extended_Pictographic}]/u;
const HEADING_DECOR = /^[\s*_~#>\-–—:•·]+|[\s*_~:\-–—]+$/g;

/** Removes emojis (🛒 ⏱️ 🍗 ...) and tidies the spaces they leave behind. */
export function stripEmoji(value: string): string {
  return value.replace(EMOJI, "").replace(/[ \t]{2,}/g, " ").trim();
}

const INGREDIENTS_HEADING = /^(המצרכים|מצרכים|המרכיבים|מרכיבים|הרכיבים|רכיבים|החומרים|חומרים|ingredients)(?=$|[\s:])/i;
const PREPARATION_HEADING =
  /^(אופן ההכנה|אופן הכנה|הוראות ההכנה|הוראות הכנה|דרך ההכנה|דרך הכנה|שלבי ההכנה|שלבי הכנה|ההכנה|הכנה|instructions|directions|method|preparation)(?=$|[\s:])/i;
const TIPS_HEADING = /^(טיפים|טיפ|הערות|הערה|דגשים|חשוב לדעת|טיפים והערות)(?=$|[\s:])/;

// A line that opens with a quantity or a measuring word -- looks like an ingredient.
const QUANTITY_LINE =
  /^[\s\-•*·–—]*(?:\d|[½¼¾⅓⅔⅛]|חצי\b|רבע\b|שליש\b|כוס|כוסות|כף|כפות|כפית|כפיות|קורט|קילו|גרם|חבילה|שן\b|שיני|מעט|קצת|ליטר|מ"ל|מ״ל|פרוסות|יחידה|יחידות)/;

const MEASURE_WORD =
  /(?:^|[\s(])(?:כפית|כפיות|כף|כפות|כוס|כוסות|גרם|גר'|קילו|ק"ג|ק״ג|ליטר|מ"ל|מ״ל|חבילה|חבילות|יחידה|יחידות|שן|שיני|קורט|חופן|פרוסה|פרוסות|קופסה|קופסת|שקית|צנצנת)(?=$|[\s,.)])/u;

// Cooking actions (imperative / present plural): a line with one of these is a step, not an ingredient.
const COOKING_VERB =
  /(?:^|[\s(])(?:מחממ|מערבב|מוסיפ|אופ(?:ים|ה|ו|ות)\b|מטגנ|מבשל|חותכ|קוצצ|מניח|מכס(?:ים|ה)|מוציא|מקפל|שופכ|מסנ|מגיש|מתבל|מורח|מעביר|מכניס|מקציפ|ממתינ|מרתיח|מצנן|מקרר|ממלא|מפזר|מועך|מגלגל|הופכ|מצפ|מחבר|תוסיפ|תערבב|תחממ|תאפ|תטגנ|תבשל|תסנ|שימו|קחו|מערב(?:ל|ים)|הוסיפו|ערבבו|בשלו|חממו|אפו|טגנו|חתכו|קצצו|הניחו|כסו|הוציאו|קפלו|שפכו|הגישו|תבלו|מרחו|העבירו|הכניסו|הקציפו|חכו|המתינו|צננו|קררו|מלאו|פזרו|סננו|מעכו|גלגלו|הפכו|לשו|לשים|ללוש)|(?:דקות|תנור|על אש|לאחר מכן|בשלב הבא)/u;

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

const isNumberedStep = (line: string) => /^\s*(?:שלב\s*)?\d{1,2}\s*[.):]\s+\S/.test(stripEmoji(line)) || /^\s*שלב\s*\d/.test(line);
const hasBullet = (line: string) => /^\s*[-•*·–—▪●◦✔✓]/.test(line) || /^\s*[\p{Extended_Pictographic}]/u.test(line);

// Common ingredient names. A short line that is just one of these (with a word or two of
// description: "בצל קצוץ", "פלפל שחור") is an ingredient even with no amount written.
const INGREDIENT_LONG = [
  "קמח", "סוכר", "שמן", "ביצה", "ביצים", "חלב", "חמאה", "שמנת", "גבינה", "יוגורט", "בצל", "בצלים", "שום", "עגבני", "גזר", "תפוח", "תפוחי", "בטטה",
  "פלפל", "מלפפון", "חציל", "קישוא", "כרוב", "חסה", "לימון", "פטרוזיליה", "כוסברה", "שמיר", "נענע", "בזיליקום", "אורז", "פסטה", "בורגול",
  "קוסקוס", "בשר", "עוף", "פרגית", "דג", "שמרים", "אבקת", "וניל", "שוקולד", "דבש", "טחינה", "חומוס", "עדשים", "שעועית", "אפונה", "תירס", "פטריות",
  "זיתים", "יין", "רסק", "מיונז", "קטשופ", "חרדל", "סילאן", "קקאו", "קינמון", "כמון", "פפריקה", "כורכום", "אגוזים", "שקדים", "פיסטוק", "צימוקים",
  "מלח", "מים", "פירורי", "גרגירי", "ג'ינג'ר", "סודה", "קורנפלור", "עמילן", "בצק",
];
const INGREDIENT_NOUN_LONG = new RegExp("(?<![\\p{L}])[בלמהוכש]?(?:" + INGREDIENT_LONG.join("|") + ")", "u");
const INGREDIENT_NOUN_SHORT = /(?<![\p{L}])[בלמהוכש]?(?:מלח|מים|שום|שמן|דג|יין|לימון)(?![\p{L}])/u;

/** A short, verb-free line that names an ingredient ("בצל קצוץ", "פלפל שחור"). */
function isBareIngredientName(text: string): boolean {
  const words = text.trim().split(/\s+/);
  if (text.length > 38 || words.length > 5 || /[.!?]/.test(text) || COOKING_VERB.test(text)) return false;
  return INGREDIENT_NOUN_LONG.test(text) || INGREDIENT_NOUN_SHORT.test(text);
}

// Boilerplate and noise that rides along with an Instagram / Facebook caption.
const NOISE_LINE = /^(?:follow|עקבו|לייק|שתפו|תייגו|תיוג|שמרו|לינק בביו|link in bio|save this|comment|תגובות)(?![\p{L}])/iu;

/** Hashtags and @mentions out; a line that was only those, a count, a creator name or a call to follow, dropped. */
function scrubLine(line: string): string {
  const cleaned = line.replace(/#[\p{L}\p{N}_]+/gu, " ").replace(/@[\w.]+/g, " ").replace(/[ \t]{2,}/g, " ").trim();
  if (!cleaned) return "";
  if (NOISE_LINE.test(cleaned)) return "";
  if (isMetricSegment(cleaned)) return "";
  // A lone Latin-letters name ("Rubi Michael") is the creator, not part of the recipe.
  if (/^(?:[A-Z][a-z]+)(?:\s+[A-Z][a-z]+){1,2}$/.test(cleaned)) return "";
  return cleaned === line.trim() ? line : cleaned;
}

/** A bullet / quantity / measure line with no cooking action: an ingredient, whichever section it was under. */
function isStrictIngredient(line: string): boolean {
  const text = stripEmoji(line);
  if (!text || text.length > 70 || isNumberedStep(line) || COOKING_VERB.test(text)) return false;
  if (/:\s*$/.test(text)) return false; // a sub-heading
  return hasBullet(line) || QUANTITY_LINE.test(text) || MEASURE_WORD.test(text) || isBareIngredientName(text);
}

/** A numbered or action line: instructions, even if it was written under the ingredients. */
function isStepLike(line: string): boolean {
  const text = stripEmoji(line);
  if (isNumberedStep(line) && (COOKING_VERB.test(text) || text.length > 40)) return true;
  return COOKING_VERB.test(text) && text.split(/\s+/).length >= 5 && !QUANTITY_LINE.test(text);
}

function tidyLine(line: string): string {
  return stripEmoji(line).replace(/^\s*[-•*·–—▪●◦✔✓]+\s*/, "").trim();
}

type HeadingInfo = { type: "ingredients" | "preparation" | "tips"; rest: string };

function headingOf(line: string): HeadingInfo | null {
  const plain = stripEmoji(line).trim();
  const bare = plain.replace(HEADING_DECOR, "");
  const candidates: [RegExp, HeadingInfo["type"]][] = [
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
    const colonAfterKeyword = /^[\s*_]*:/.test(bare.slice(match[0].length));
    const trailingColon = /:\s*[*_]*$/.test(plain);
    if (remainder === "") return { type, rest: "" };
    if (colonAfterKeyword) return { type, rest: remainder };
    // "מצרכים לרוטב:" -- a sub-heading: keep its label (as "לרוטב:") inside the section.
    if (trailingColon && remainder.length <= 30 && !/\d/.test(remainder)) return { type, rest: `${remainder.replace(/:\s*$/, "")}:` };
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

/**
 * Moves each line to the section it belongs in, whichever heading it was under:
 * bullet/quantity/measure lines without a cooking action are ingredients; numbered
 * or action lines are instructions.
 */
function redistribute(ingredientLines: string[], prepLines: string[]): { ingredients: string[]; prep: string[] } {
  const ingredients: string[] = [];
  const movedToPrep: string[] = [];
  for (const line of ingredientLines) {
    if (!line.trim()) continue;
    if (isStepLike(line)) movedToPrep.push(line);
    else ingredients.push(line);
  }
  const prep: string[] = [...movedToPrep];
  for (const line of prepLines) {
    if (line.trim() && isStrictIngredient(line)) ingredients.push(line);
    else prep.push(line);
  }
  return { ingredients, prep };
}

function joinText(lines: string[]): string {
  return lines
    .map((line) => stripEmoji(line))
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

export function parseRecipeText(rawText: string): ParsedRecipeText {
  const lines = rawText.split(/\r?\n/).map(cleanLine).map(scrubLine);
  let section: "pre" | "ingredients" | "preparation" | "tips" = "pre";
  let sawHeading = false;
  const pre: string[] = [];
  const buckets = { ingredients: [] as string[], preparation: [] as string[], tips: [] as string[] };

  for (const line of lines) {
    if (!line.trim()) {
      if (section === "preparation" || section === "tips") buckets[section].push("");
      continue;
    }
    // A line that was only emojis / decoration carries nothing.
    if (!stripEmoji(line).replace(/[*_~\-–—•·\s]/g, "")) continue;
    const heading = headingOf(line);
    if (heading) {
      sawHeading = true;
      section = heading.type;
      if (heading.rest) buckets[heading.type].push(heading.rest);
      continue;
    }
    if (section === "pre") pre.push(line);
    else buckets[section].push(line);
  }

  // Title: the dish name from the first line; whatever else that line carried goes to the notes.
  let title = "";
  const introParts: string[] = [];
  let preLines = pre.filter((line) => line.trim());
  // (The first line is a title unless it plainly starts like an ingredient: a dish name may well
  // contain an ingredient word or start with an emoji.)
  const firstLooksLikeIngredient = (line: string) => {
    const text = stripEmoji(line);
    return /^\s*[-•*·–—]/.test(line) || QUANTITY_LINE.test(text) || (MEASURE_WORD.test(text) && text.length <= 40 && !COOKING_VERB.test(text));
  };
  if (preLines.length > 0 && !/^https?:\/\//i.test(preLines[0].trim()) && !firstLooksLikeIngredient(preLines[0])) {
    const split = splitTitle(preLines[0]);
    title = split.title;
    if (split.extra) introParts.push(split.extra);
    preLines = preLines.slice(1);
  }

  let ingredientLines = buckets.ingredients;
  let prepLines = buckets.preparation;
  const tipLines = buckets.tips;

  if (!sawHeading) {
    // No headings: bullet / quantity lines are the ingredients, the rest is the method.
    const body = preLines;
    const flags = body.map((line) => isStrictIngredient(line));
    const count = flags.filter(Boolean).length;
    if (count >= 2) {
      ingredientLines = body.filter((_, index) => flags[index]);
      prepLines = body.filter((_, index) => !flags[index]);
    } else {
      prepLines = body;
    }
    preLines = [];
  } else if (preLines.length > 0) {
    introParts.push(...preLines);
  }

  const split = redistribute(ingredientLines, prepLines);
  let ingredients = split.ingredients.map(tidyLine).map(stripListMarker).filter(Boolean);
  // A single "ביצים, קמח, סוכר" line is several ingredients written inline.
  if (ingredients.length === 1 && (ingredients[0].match(/,/g) ?? []).length >= 2) {
    ingredients = ingredients[0].split(",").map((part) => part.trim()).filter(Boolean);
  }

  return {
    title,
    ingredients,
    instructions: joinText(split.prep),
    tips: joinText(tipLines),
    intro: joinText(introParts),
    servings: parseServings(rawText),
    confident: sawHeading && ingredients.length > 0,
  };
}

// ---------------------------------------------------------------------------
// Titles: the dish name only
// ---------------------------------------------------------------------------

// "291K views", "4.7K reactions", "1,234 likes", "291K צפיות", "4.7K רגשות" ...
const METRIC =
  /[\d.,]+\s?[KkMm]?\+?\s*(?:views?|likes?|comments?|reactions?|shares?|plays?|followers?|צפיות|צפייה|צפיה|לייקים|לייק|תגובות|רגשות|שיתופים|אהבו|עוקבים)(?![\p{L}])|(?<![\p{L}])(?:views?|likes?|צפיות|לייקים|תגובות|רגשות)\s*[:·]?\s*[\d.,]+\s?[KkMm]?/giu;

const PLATFORM_ONLY = /^(?:instagram|facebook|tiktok|youtube|threads|reels?|fb|ig|watch)$/i;
const TITLE_MAX = 60;

function isMetricSegment(segment: string): boolean {
  const bare = segment.replace(METRIC, "").replace(/[\s·|,.\-–—]/g, "");
  return bare === "" || /^[\d.,KkMm]+$/.test(bare);
}

// A creator handle / name: Latin letters only ("Rubi Michael", "Itay Edri"), or @handle.
function isCreatorSegment(segment: string): boolean {
  const text = segment.trim();
  if (/^@/.test(text)) return true;
  return /^[A-Za-z][A-Za-z0-9 ._'-]{1,40}$/.test(text) && !/\p{Script=Hebrew}/u.test(text);
}

/**
 * Pulls the dish name out of whatever a post / page / caption put in the title:
 * drops view and reaction counts, creator names, platform names, hashtags,
 * mentions, links and emojis, and keeps the first short phrase. `extra` is the
 * original text when it differs, so nothing is lost -- it belongs in the notes.
 */
export function splitTitle(raw: string): { title: string; extra: string } {
  const original = raw.replace(INVISIBLE, "").trim();
  let text = original;

  // 'Rubi Michael on Instagram: "caption..."' -> the caption.
  const quoted = text.match(/^.{0,80}?\s+on\s+(?:Instagram|Facebook|TikTok|YouTube|Threads)\s*[:\-–]\s*[“"'׳]?([\s\S]*)$/i);
  if (quoted) text = quoted[1];
  // '291K likes, 12 comments - user on March 3, 2024: "caption"'
  const metricsThenQuote = text.match(/^[\d.,KkMm]+\s*(?:likes?|views?|comments?)[^:"“]{0,80}[:\-–]\s*[“"']?([\s\S]*)$/i);
  if (metricsThenQuote) text = metricsThenQuote[1];
  text = text.replace(/[“”"]+\s*$/, "");

  // "a | b · c - d": keep the first segment that is neither a count, a platform nor a creator.
  const segments = text
    .split(/\s*[|·•]\s*|\s+[-–—]\s+/)
    .map((segment) => segment.trim())
    .filter(Boolean);
  const candidates = segments.filter(
    (segment) => !isMetricSegment(segment) && !PLATFORM_ONLY.test(segment) && !isCreatorSegment(segment)
  );
  const picked = candidates.find((segment) => /\p{Script=Hebrew}/u.test(segment)) ?? candidates[0] ?? segments[0] ?? text;
  text = picked;

  // A caption uses an emoji as its separator: the dish name is what comes before it.
  const beforeEmoji = text.split(EMOJI_ONE)[0].trim();
  if (beforeEmoji.length >= 3) text = beforeEmoji;

  text = stripEmoji(text)
    .replace(METRIC, " ")
    .replace(/https?:\/\/\S+/gi, " ")
    .replace(/[#@]\S+/g, " ")
    .split(/\r?\n/)[0]
    .replace(/^\s*מתכון\s*(?:ל|של\s|ל-)\s*/u, "")
    .replace(/^\s*מתכון\s*[:\-–]\s*/u, "")
    .trim();

  // First phrase only: up to a sentence end or a colon.
  const stop = text.search(/[.!?…](?:\s|$)|:\s/);
  if (stop >= 3) text = text.slice(0, stop);
  text = text
    .replace(/\s+(?:מצרכים|המצרכים|מרכיבים|אופן הכנה|הכנה|המתכון|מתכון)\s*$/u, "")
    .replace(/^[\s"'“”,.:;\-–—*#]+|[\s"'“”,.:;\-–—*#]+$/g, "")
    .replace(/\s{2,}/g, " ");

  if (text.length > TITLE_MAX) {
    const cut = text.slice(0, TITLE_MAX);
    text = cut.slice(0, Math.max(cut.lastIndexOf(" "), 20)).trim();
  }
  const title = text || stripEmoji(original).slice(0, TITLE_MAX).trim();
  return { title, extra: normalizeText(title) === normalizeText(original) ? "" : original };
}

export function cleanTitle(raw: string): string {
  return splitTitle(raw).title;
}

/** Instagram/Facebook descriptions arrive as '291K likes, 5 comments - user on <date>: "caption"': keep the caption. */
export function stripSocialPrefix(description: string): string {
  const text = description.trim();
  const match = text.match(/^[\d.,KkMm]+\s*(?:likes?|views?|comments?|reactions?)[^:"“]{0,120}:\s*[“"']?([\s\S]*)$/i);
  const body = match ? match[1] : text;
  return body.replace(/[“”"]+\s*\.?\s*$/, "").trim();
}

// ---------------------------------------------------------------------------
// Categories by keyword
// ---------------------------------------------------------------------------

export const DEFAULT_CATEGORIES: { name: string; emoji: string; keywords: string[] }[] = [
  { name: "בשרים ועופות", emoji: "🥩", keywords: ["בשר", "עוף", "פרגית", "פרגיות", "שניצל", "קציצ", "קבב", "סטייק", "אנטריקוט", "כבד", "המבורגר", "שווארמה", "צלי", "כתף", "בקר", "הודו", "נקניקיות", "חזה עוף", "כרעיים", "שוק", "טחון", "אסאדו", "אסאדו", "בשרי", "צלעות", "ריבס"] },
  { name: "דגים", emoji: "🐟", keywords: ["דג", "דגים", "סלמון", "טונה", "דניס", "לברק", "אמנון", "בורי", "סרדין", "מוסר", "טילאפיה", "גפילטע", "פילה דג", "שרימפס", "קלמרי"] },
  { name: "מרקים", emoji: "🍲", keywords: ["מרק", "קובה", "שורבה", "מרקים", "לחשו"] },
  { name: "סלטים", emoji: "🥗", keywords: ["סלט", "סלטים", "טחינה", "חומוס", "מטבוחה", "כרוב", "חציל", "סלסה", "גוואקמולי", "טאבולה", "קולסלו"] },
  { name: "פסטות ואורז", emoji: "🍝", keywords: ["פסטה", "ספגטי", "מקרוני", "לזניה", "ניוקי", "פנה", "אורז", "ריזוטו", "קוסקוס", "נודלס", "פתיתים", "תבשיל"] },
  { name: "מאפים ולחמים", emoji: "🥐", keywords: ["לחם", "חלה", "פיצה", "בורקס", "בצק", "לחמניות", "פוקאצ", "פיתה", "לחמניה", "מאפה", "קרואסון", "טורטייה", "בייגל", "שקשוקה בפיתה"] },
  { name: "קינוחים ועוגות", emoji: "🍰", keywords: ["עוגה", "עוגת", "עוגיות", "עוגיה", "קינוח", "מוס", "גלידה", "פאי", "טירמיסו", "בראוניז", "קרמבו", "פנקייק", "סופגניות", "ממתק", "שוקולד", "קראמבל", "מתוק", "קרפ", "וופל", "צ'יזקייק", "מלבי"] },
  { name: "ארוחת בוקר", emoji: "🍳", keywords: ["שקשוקה", "חביתה", "אומלט", "גבינה", "פשטידה", "מצקצקת", "פנקייק", "גרנולה", "טוסט", "שקשוקה"] },
  { name: "צמחוני וטבעוני", emoji: "🥦", keywords: ["צמחוני", "טבעוני", "טופו", "קטניות", "עדשים", "חומוס", "פלאפל", "ירקות", "קציצות ירק"] },
  { name: "ארוחת שישי", emoji: "🍷", keywords: ["חמין", "קוגל", "גפילטע", "כרעיים", "שישי", "שבת", "צלי", "כבד קצוץ"] },
];

/** The family's own tags beyond the built-in categories. */
const EXTRA_SUGGESTED = ["חגים", "מהיר ופשוט", "ילדים", "ללא גלוטן"];
export const SUGGESTED_TAGS = [...DEFAULT_CATEGORIES.map((category) => category.name), ...EXTRA_SUGGESTED];

const EXTRA_EMOJI: Record<string, string> = { חגים: "🕎", "מהיר ופשוט": "⚡", ילדים: "🧒", "ללא גלוטן": "🌾" };
const TAG_PALETTE = [
  "bg-rose-50 text-rose-700 border-rose-200 dark:bg-rose-950/30 dark:text-rose-300 dark:border-rose-900/50",
  "bg-sky-50 text-sky-700 border-sky-200 dark:bg-sky-950/30 dark:text-sky-300 dark:border-sky-900/50",
  "bg-orange-50 text-orange-700 border-orange-200 dark:bg-orange-950/30 dark:text-orange-300 dark:border-orange-900/50",
  "bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-950/30 dark:text-emerald-300 dark:border-emerald-900/50",
  "bg-amber-50 text-amber-800 border-amber-200 dark:bg-amber-950/30 dark:text-amber-300 dark:border-amber-900/50",
  "bg-pink-50 text-pink-700 border-pink-200 dark:bg-pink-950/30 dark:text-pink-300 dark:border-pink-900/50",
  "bg-violet-50 text-violet-700 border-violet-200 dark:bg-violet-950/30 dark:text-violet-300 dark:border-violet-900/50",
  "bg-lime-50 text-lime-800 border-lime-200 dark:bg-lime-950/30 dark:text-lime-300 dark:border-lime-900/50",
  "bg-teal-50 text-teal-700 border-teal-200 dark:bg-teal-950/30 dark:text-teal-300 dark:border-teal-900/50",
  "bg-fuchsia-50 text-fuchsia-700 border-fuchsia-200 dark:bg-fuchsia-950/30 dark:text-fuchsia-300 dark:border-fuchsia-900/50",
];

/** A stable colour for a tag, so the same category looks the same everywhere. */
export function tagColorClasses(name: string): string {
  let hash = 0;
  for (const char of name) hash = (hash * 31 + char.codePointAt(0)!) % 9973;
  return TAG_PALETTE[hash % TAG_PALETTE.length];
}

/** An emoji for a tag: a built-in category's own, else guessed from its words, else a plate. */
export function emojiForTag(name: string): string {
  const exact = DEFAULT_CATEGORIES.find((category) => category.name === name);
  if (exact) return exact.emoji;
  if (EXTRA_EMOJI[name]) return EXTRA_EMOJI[name];
  const guessed = suggestCategories({ title: name, ingredients: [] });
  const found = DEFAULT_CATEGORIES.find((category) => category.name === guessed[0]);
  return found?.emoji ?? "🍽️";
}

function hasKeyword(tokens: string[], text: string, keyword: string): boolean {
  const needle = normalizeText(keyword);
  if (needle.length >= 4) return text.includes(needle);
  // Short words must match a whole word (allowing one attached prefix letter), so "דג" doesn't hit "דגנים".
  return tokens.some((token) => token === needle || (token.length === needle.length + 1 && /^[בלמהוכש]/.test(token) && token.slice(1) === needle));
}

/**
 * Categories a recipe belongs in, from its dish name first (one hit is enough) and
 * its ingredients second (needs two). At most two, best first.
 */
export function suggestCategories(recipe: { title: string; ingredients: string[] }): string[] {
  const titleText = normalizeText(recipe.title);
  const titleTokens = titleText.split(" ").filter(Boolean);
  const ingredientText = normalizeText(recipe.ingredients.slice(0, 14).join(" "));
  const ingredientTokens = ingredientText.split(" ").filter(Boolean);

  const scored = DEFAULT_CATEGORIES.map((category) => {
    const titleHits = category.keywords.filter((keyword) => hasKeyword(titleTokens, titleText, keyword)).length;
    const ingredientHits = category.keywords.filter((keyword) => hasKeyword(ingredientTokens, ingredientText, keyword)).length;
    return { name: category.name, score: titleHits * 3 + (ingredientHits >= 2 ? ingredientHits : 0), titleHits };
  }).filter((entry) => entry.titleHits > 0 || entry.score > 0);
  scored.sort((a, b) => b.score - a.score);
  return scored.slice(0, 2).map((entry) => entry.name);
}

// ---------------------------------------------------------------------------
// Cleaning up recipes that are already saved
// ---------------------------------------------------------------------------

export type RepairResult = {
  title: string;
  ingredients: string[];
  instructions: string;
  tips: string;
  description: string;
  servings: number | null;
  /** Nothing to change. */
  unchanged: boolean;
  titleChanged: boolean;
  sectionsChanged: boolean;
};

/**
 * Re-cleans one saved recipe: a clean dish-name title (the junk goes to the notes),
 * headings and emojis out of the text, ingredient lines back among the ingredients and
 * steps back among the instructions. Uses the original imported text when it still
 * parses with headings; otherwise it re-sorts the fields as they are.
 */
export function repairRecipe(recipe: Pick<Recipe, "title" | "ingredients" | "instructions" | "tips" | "description" | "original_text" | "servings">): RepairResult {
  const split = splitTitle(recipe.title || "");
  let title = split.title;
  let description = recipe.description;
  if (split.extra && !normalizeText(description).includes(normalizeText(split.extra).slice(0, 60))) {
    description = [split.extra, description].filter(Boolean).join("\n\n");
  }

  let ingredients: string[];
  let instructions: string;
  let tips = recipe.tips;
  let servings = recipe.servings;

  const original = recipe.original_text?.trim() ?? "";
  const reparsed = original ? parseRecipeText(original) : null;
  if (reparsed && reparsed.confident) {
    ingredients = reparsed.ingredients;
    instructions = reparsed.instructions;
    tips = reparsed.tips || recipe.tips;
    servings = servings ?? reparsed.servings;
    // The original's own first line may be the real dish name when the saved one was junk.
    if (!title && reparsed.title) title = reparsed.title;
    if (reparsed.intro && !normalizeText(description).includes(normalizeText(reparsed.intro).slice(0, 60))) {
      description = [description, reparsed.intro].filter(Boolean).join("\n\n");
    }
  } else {
    const ingredientLines = recipe.ingredients.flatMap((line) => line.split("\n"));
    const redistributed = redistribute(ingredientLines, recipe.instructions.split("\n"));
    // Heading words that ended up inside the text fields are dropped.
    const withoutHeadings = (lines: string[]) =>
      lines.flatMap((line) => {
        const heading = line.trim() ? headingOf(line) : null;
        if (!heading) return [line];
        return heading.rest ? [heading.rest] : [];
      });
    ingredients = withoutHeadings(redistributed.ingredients).map(tidyLine).map(stripListMarker).filter(Boolean);
    instructions = joinText(withoutHeadings(redistributed.prep));
    tips = joinText(withoutHeadings(tips.split("\n")));
  }
  if (!title) title = "מתכון ללא שם";

  const titleChanged = title !== recipe.title;
  const sectionsChanged =
    ingredients.join("\n") !== recipe.ingredients.join("\n") || instructions !== recipe.instructions.trim() || tips !== recipe.tips;
  return {
    title,
    ingredients,
    instructions,
    tips,
    description,
    servings,
    unchanged: !titleChanged && !sectionsChanged && description === recipe.description,
    titleChanged,
    sectionsChanged,
  };
}

/** Recipes that are the same dish written for different batch sizes: keep one, drop the rest. */
export type QuantityDuplicateGroup = { keep: Recipe; remove: Recipe[] };

function shapeOf(lines: string[]): Set<string> {
  // The ingredient names without amounts or units: "500 גרם בשר טחון" and "1 קילו בשר טחון" look alike.
  return new Set(
    lines
      .map((line) => normalizeText(line.replace(/[\d½¼¾⅓⅔⅛/.,]+/g, " ")).replace(/(?:^|\s)(?:כפית|כפיות|כף|כפות|כוס|כוסות|גרם|קילו|ק"ג|ליטר|יחידות|יחידה|חבילה|שיני|שן|מ"ל)(?=\s|$)/gu, " ").replace(/\s+/g, " ").trim())
      .filter(Boolean)
  );
}

function magnitudeOf(lines: string[]): number {
  let total = 0;
  for (const line of lines) {
    for (const match of line.matchAll(QUANTITY_TOKEN)) {
      const value = parseQuantity(match as RegExpMatchArray);
      if (value) {
        total += value;
        break; // first quantity of the line is its amount
      }
    }
  }
  return total;
}

export function planQuantityDuplicates(recipes: Recipe[]): QuantityDuplicateGroup[] {
  const byTitle = new Map<string, Recipe[]>();
  for (const recipe of recipes) {
    const key = normalizeText(cleanTitle(recipe.title));
    if (!key || recipe.ingredients.length < 2) continue;
    byTitle.set(key, [...(byTitle.get(key) ?? []), recipe]);
  }

  const groups: QuantityDuplicateGroup[] = [];
  for (const sameTitle of byTitle.values()) {
    if (sameTitle.length < 2) continue;
    // Within one title, cluster the recipes whose ingredient lists are the same apart from amounts.
    const used = new Set<string>();
    for (const first of sameTitle) {
      if (used.has(first.id)) continue;
      const shape = shapeOf(first.ingredients);
      const cluster = sameTitle.filter((other) => {
        if (used.has(other.id)) return false;
        const otherShape = shapeOf(other.ingredients);
        return other === first || jaccard(shape, otherShape) >= 0.9;
      });
      cluster.forEach((recipe) => used.add(recipe.id));
      if (cluster.length < 2) continue;
      // Keep the middle batch size (500g / 1kg / 1.5kg -> 1kg); on a tie, the newest (list order).
      const ordered = [...cluster].sort((a, b) => magnitudeOf(a.ingredients) - magnitudeOf(b.ingredients));
      const keep = ordered[Math.floor((ordered.length - 1) / 2)];
      groups.push({ keep, remove: cluster.filter((recipe) => recipe !== keep) });
    }
  }
  return groups;
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
        parsed: { title: "", ingredients: [], instructions: "", tips: "", intro: "", servings: null, confident: false },
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
    categories: suggestCategories({ title: parsed.title, ingredients: parsed.ingredients }),
    ingredients: parsed.ingredients,
    instructions: parsed.instructions,
    tips: parsed.tips,
    description: parsed.intro,
    servings: parsed.servings,
    original_text: text.trim(),
  };
}

/** An existing recipe as an editable draft (id and timestamps dropped). */
export function recipeToDraft(recipe: Recipe): RecipeDraft {
  return {
    title: recipe.title,
    categories: recipe.categories,
    servings: recipe.servings,
    ingredients: recipe.ingredients,
    instructions: recipe.instructions,
    tips: recipe.tips,
    description: recipe.description,
    source_url: recipe.source_url,
    embed_url: recipe.embed_url,
    image_url: recipe.image_url,
    original_text: recipe.original_text,
    is_favorite: recipe.is_favorite,
  };
}

// ---------------------------------------------------------------------------
// Review before saving: lines the parser can't be sure about
// ---------------------------------------------------------------------------

export type ReviewItem = {
  id: number;
  field: "ingredients" | "instructions" | "general";
  line: string;
  reason: string;
  /** Moving the line to the other field is probably right. */
  suggestMove: "toInstructions" | "toIngredients" | null;
  /** Likely wrong (vs. just unclear). */
  strong: boolean;
};

/**
 * Looks over a recipe draft the way a person would and lists what deserves a second look: an
 * ingredient that reads like a method step (or the reverse), a line with both an amount and a
 * cooking action, an ingredient without any amount, missing sections. Pure; used by the
 * review stage shown before a pasted recipe is saved.
 */
export function reviewDraft(draft: Pick<RecipeDraft, "title" | "ingredients" | "instructions">): ReviewItem[] {
  const items: Omit<ReviewItem, "id">[] = [];

  if (!draft.title.trim() || draft.title === "מתכון ללא שם") {
    items.push({ field: "general", line: "", reason: "לא זוהה שם למתכון - כדאי להוסיף אחד", suggestMove: null, strong: false });
  }
  if (draft.ingredients.length === 0 && draft.instructions.trim()) {
    items.push({ field: "general", line: "", reason: "לא זוהו מצרכים - בדקו אם מצרכים הוכנסו בטעות לשדה ההכנה", suggestMove: null, strong: true });
  }
  if (draft.instructions.trim() === "" && draft.ingredients.length > 0) {
    items.push({ field: "general", line: "", reason: "לא נמצא אופן הכנה", suggestMove: null, strong: false });
  }

  for (const line of draft.ingredients) {
    const text = stripEmoji(line);
    if (!text.trim()) continue;
    const hasVerb = COOKING_VERB.test(text);
    const hasAmount = QUANTITY_LINE.test(text) || MEASURE_WORD.test(text);
    if (isStepLike(line) || (hasVerb && !hasAmount && text.split(/\s+/).length >= 3)) {
      items.push({ field: "ingredients", line, reason: "נראית כהוראת הכנה ולא כמצרך", suggestMove: "toInstructions", strong: true });
    } else if (hasVerb && hasAmount) {
      items.push({ field: "ingredients", line, reason: "טקסט מעורב: יש גם כמות וגם פעולת בישול", suggestMove: null, strong: false });
    } else if (text.length > 90) {
      items.push({ field: "ingredients", line, reason: "שורה ארוכה מאוד - אולי כמה מצרכים או הוראה", suggestMove: null, strong: false });
    } else if (!hasAmount && !isBareIngredientName(text) && text.split(/\s+/).length >= 2 && !/:\s*$/.test(text)) {
      items.push({ field: "ingredients", line, reason: "לא זוהתה כמות או יחידת מידה", suggestMove: null, strong: false });
    }
  }

  for (const line of draft.instructions.split("\n")) {
    if (line.trim() && isStrictIngredient(line) && (hasBullet(line) || QUANTITY_LINE.test(stripEmoji(line)))) {
      items.push({ field: "instructions", line, reason: "נראית כמצרך ולא כהוראה", suggestMove: "toIngredients", strong: true });
    }
  }

  // Strongest first, and not an endless list.
  items.sort((a, b) => Number(b.strong) - Number(a.strong));
  return items.slice(0, 14).map((item, index) => ({ ...item, id: index }));
}

// ---------------------------------------------------------------------------
// Smart (culinary) scaling and sharing text
// ---------------------------------------------------------------------------

/**
 * How an ingredient behaves when a recipe is made bigger or smaller. Meat, eggs, onions, flour,
 * crumbs... scale one-to-one; strong flavours, liquids and the oil for the pan don't (double the
 * salt and the dish is too salty, double the water and the sauce is too thin).
 */
export type ScaleClass = "base" | "spice" | "liquid" | "leaven" | "fat";

/** The share of the batch change each class follows: 1 = proportional, lower = gentler. */
export const SCALE_EXPONENT: Record<ScaleClass, number> = { base: 1, spice: 0.75, liquid: 0.9, leaven: 0.9, fat: 0.85 };

const SPICE_WORDS = [
  "מלח", "פלפל שחור", "פלפל לבן", "פלפל אנגלי", "פלפל חריף", "כמון", "פפריקה", "כורכום", "קינמון", "אורגנו", "טימין", "רוזמרין", "זעתר", "הל", "קארי", "סומאק",
  "בהרט", "צ'ילי", "אבקת שום", "אבקת בצל", "אבקת מרק", "עלי דפנה", "אגוז מוסקט", "וניל", "תבלין", "שום", "ג'ינג'ר", "מרווה", "קימל", "זנגביל", "ציפורן", "אניס",
];
const LEAVEN_WORDS = ["אבקת אפייה", "אבקת אפיה", "סודה לשתייה", "סודה לשתיה", "שמרים", "שמרי"];
const LIQUID_WORDS = ["מים", "חלב", "מרק", "ציר", "יין", "רוטב", "רסק", "קטשופ", "שמנת", "מיץ", "חומץ", "סויה", "ברנדי", "בירה", "קוניאק", "משקה", "מיונז", "טחינה גולמית"];
const FAT_WORDS = ["שמן", "שמן זית", "ספריי"];

function hasPhrase(text: string, phrase: string): boolean {
  const escaped = phrase.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return new RegExp("(?<![\\p{L}])[בלמהוכש]?" + escaped + "(?![\\p{L}])", "u").test(text);
}

export function ingredientScaleClass(line: string): ScaleClass {
  const text = normalizeText(line);
  // Longest, most specific groups first ("אבקת שום" is a spice, not the vegetable; "מים" in "מי ורדים" is irrelevant).
  if (LEAVEN_WORDS.some((word) => hasPhrase(text, normalizeText(word)))) return "leaven";
  if (SPICE_WORDS.some((word) => hasPhrase(text, normalizeText(word)))) return "spice";
  if (FAT_WORDS.some((word) => hasPhrase(text, normalizeText(word)))) return "fat";
  if (LIQUID_WORDS.some((word) => hasPhrase(text, normalizeText(word)))) return "liquid";
  return "base";
}

/** The first amount written in the line (2, 1/2, 1.5, חצי...), or null. */
export function leadingAmount(line: string): number | null {
  for (const match of line.matchAll(QUANTITY_TOKEN)) {
    const value = parseQuantity(match as RegExpMatchArray);
    if (value !== null && value > 0) return value;
  }
  return null;
}

/** Scales one ingredient line with the culinary rules above instead of one flat multiplier. */
export function smartScaleIngredientLine(line: string, factor: number): { text: string; scaled: boolean; scaleClass: ScaleClass } {
  const scaleClass = ingredientScaleClass(line);
  const effective = Number.isFinite(factor) && factor > 0 ? Math.pow(factor, SCALE_EXPONENT[scaleClass]) : factor;
  return { ...scaleIngredientLine(line, effective), scaleClass };
}

/** A recipe as plain text for WhatsApp / e-mail / clipboard (WhatsApp's own *bold* for headings). */
export function formatRecipeForShare(recipe: {
  title: string;
  servings?: number | null;
  ingredients: string[];
  instructions: string;
  tips: string;
  source_url?: string | null;
}): string {
  const lines: string[] = [`🍽️ *${recipe.title}*`];
  if (recipe.servings) lines.push(`מנות: ${recipe.servings}`);
  if (recipe.ingredients.length > 0) {
    lines.push("", "*מצרכים:*", ...recipe.ingredients.map((line) => `- ${line}`));
  }
  if (recipe.instructions.trim()) lines.push("", "*אופן ההכנה:*", recipe.instructions.trim());
  if (recipe.tips.trim()) lines.push("", "*טיפים:*", recipe.tips.trim());
  if (recipe.source_url) lines.push("", recipe.source_url);
  lines.push("", "נשלח מ-Samama Home");
  return lines.join("\n");
}

/**
 * A shopping-list entry from an ingredient line: "2 כוסות קמח" -> name "קמח" (amount "2 כוסות"),
 * "3 ביצים" -> name "ביצים" with a count of 3. Used by "export to the shopping list".
 */
export function ingredientToShoppingItem(line: string): { name: string; amountText: string | null; count: number } {
  let text = stripEmoji(line).replace(/\([^)]*\)/g, " ").split(",")[0].trim();
  const unit = "(?:כוסות|כוס|כפות|כף|כפיות|כפית|גרם|גר'|ק\"ג|ק״ג|קילו|קילוגרם|ליטר|מ\"ל|מ״ל|חבילות|חבילה|קופסאות|קופסה|שקיות|שקית|צנצנות|צנצנת|שיני|שן|חופן|קורט|פרוסות|פרוסה|יחידות|יחידה)";
  const leading = new RegExp("^[\\s\\-•*]*((?:\\d+(?:[.,]\\d+)?(?:\\s*[-–]\\s*\\d+(?:[.,]\\d+)?)?|\\d+\\s*/\\s*\\d+|[½¼¾⅓⅔]|חצי|רבע|שליש)\\s*)?(" + unit + "\\s+)?(?:של\\s+)?", "u");
  const match = text.match(leading);
  let amount: string | null = null;
  let count = 1;
  if (match && (match[1] || match[2])) {
    const number = (match[1] ?? "").trim();
    const measure = (match[2] ?? "").trim();
    text = text.slice(match[0].length).trim();
    if (measure) amount = `${number} ${measure}`.trim();
    else if (/^\d+$/.test(number)) count = Math.min(20, Math.max(1, Number(number)));
    else if (number) amount = number;
  }
  const name = text.replace(/^[\s\-•*]+/, "").replace(/\s{2,}/g, " ").trim() || stripEmoji(line).trim();
  return { name, amountText: amount, count };
}

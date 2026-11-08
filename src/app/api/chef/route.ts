import { GoogleGenerativeAI } from "@google/generative-ai";

// "Ask the Chef": answers cooking questions (about ONE recipe, or free-standing) with Google Gemini
// (free tier). The API key stays on the server (GEMINI_API_KEY in the Vercel project settings) and
// never reaches the browser.
//
// Built to be FAST: one light model, no model hunting, a short prompt and a short answer, and a
// hard 8s cap -- when Gemini doesn't answer in time the visitor gets a short error, not a hang.
//
// This route has no sign-in, like the rest of the app, so it is limited: short questions,
// a short history, a bounded recipe, and a per-visitor rate limit -- enough to stop a
// stray script from running up the bill, not a substitute for real authentication.

export const maxDuration = 15;

const MAX_QUESTION_CHARS = 400;
const MAX_HISTORY = 4;
const MAX_RECIPE_CHARS = 3000;
const MAX_OUTPUT_TOKENS = 500;
const WINDOW_MS = 10 * 60 * 1000;
const MAX_REQUESTS_PER_WINDOW = 20;

// One fixed model on the stable v1 endpoint. The GEMINI_MODEL environment variable is deliberately NOT
// read: a stale value left in the project settings (an old or unsupported model) must never decide
// which model the chef calls. To change the model, change this constant.
const MODEL = "gemini-1.5-flash";
const TIMEOUT_MS = 8000;

/** HTTP status of a Gemini SDK error ("[404 Not Found] ..." when the status field isn't set). */
function statusOf(error: unknown): number | undefined {
  const direct = (error as { status?: unknown } | null)?.status;
  if (typeof direct === "number") return direct;
  const match = String((error as Error | null)?.message ?? "").match(/\[(\d{3})\s/);
  return match ? Number(match[1]) : undefined;
}

/** The key itself is the problem. */
function isKeyProblem(status: number | undefined, message: string): boolean {
  return status === 401 || status === 403 || (status === 400 && /API key|API_KEY/i.test(message));
}

const hits = new Map<string, number[]>();

function rateLimited(visitor: string): boolean {
  const now = Date.now();
  const recent = (hits.get(visitor) ?? []).filter((time) => now - time < WINDOW_MS);
  recent.push(now);
  hits.set(visitor, recent);
  if (hits.size > 500) for (const [key, times] of hits) if (times.every((time) => now - time >= WINDOW_MS)) hits.delete(key);
  return recent.length > MAX_REQUESTS_PER_WINDOW;
}

type ChefRequest = {
  recipe?: { title?: string; servings?: number | null; ingredients?: string[]; instructions?: string; tips?: string };
  messages?: { role?: string; content?: string }[];
};

// Short on purpose: fewer input tokens, faster first word.
const SYSTEM = `אתה "השף", עוזר בישול במטבח ישראלי. ענה בעברית, עד 80 מילים, בלי הקדמות.
עבוד לפי המתכון למטה. בתחליף - ציין מה מחליפים, כמה, ומה ישתנה. כשרות: לעולם אל תערבב בשר וחלב; "פרווה" = תחליפים לא-חלביים. כלי אחר (נינג'ה/איר פרייר/סיר לחץ) - טמפרטורה וזמן משוערים. שאלה לא קשורה - אמור שאתה כאן בשביל המתכון.`;

// Free-standing chef (opened from the recipes screen, no recipe): a general cooking assistant.
const SYSTEM_FREE = `אתה "השף", עוזר בישול במטבח ישראלי. ענה בעברית, עד 100 מילים, בלי הקדמות. אל תערבב בשר וחלב.
כשמבקשים מתכון: שורה ראשונה = שם המנה; "מצרכים:" עם כמות בכל שורה; "אופן ההכנה:" עם שלבים ממוספרים. בלי אימוג'ים. שאלה לא קשורה לבישול - אמור שאתה כאן בשביל המטבח.`;

function recipeContext(recipe: NonNullable<ChefRequest["recipe"]>): string {
  const lines = [
    `מתכון: ${recipe.title ?? ""}${recipe.servings ? ` (${recipe.servings} מנות)` : ""}`,
    "מצרכים:",
    ...(recipe.ingredients ?? []).map((line) => `- ${line}`),
    "הכנה:",
    recipe.instructions ?? "",
  ];
  return lines.filter(Boolean).join("\n").slice(0, MAX_RECIPE_CHARS);
}

/** Whatever goes wrong inside, the caller gets valid JSON back -- never a hung or empty response. */
export async function POST(request: Request) {
  try {
    return await handle(request);
  } catch (error) {
    console.error("[chef] unexpected error:", error);
    return Response.json({ error: "failed", detail: String((error as Error | null)?.message ?? error).slice(0, 300) }, { status: 500 });
  }
}

async function handle(request: Request): Promise<Response> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    return Response.json({ error: "no_key" }, { status: 503 });
  }

  const visitor = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown";
  if (rateLimited(visitor)) {
    return Response.json({ error: "rate_limited" }, { status: 429 });
  }

  let body: ChefRequest;
  try {
    body = (await request.json()) as ChefRequest;
  } catch {
    return Response.json({ error: "bad_request" }, { status: 400 });
  }
  // `recipe` is optional: without it the chef is a free-standing cooking assistant.
  if (!Array.isArray(body.messages)) {
    return Response.json({ error: "bad_request" }, { status: 400 });
  }

  // Keep the last few turns, strictly alternating, starting and ending with the user.
  const turns = body.messages
    .filter((message) => (message.role === "user" || message.role === "assistant") && typeof message.content === "string" && message.content.trim())
    .map((message) => ({ role: message.role as "user" | "assistant", content: (message.content as string).trim().slice(0, MAX_QUESTION_CHARS) }))
    .slice(-MAX_HISTORY);
  while (turns.length > 0 && turns[0].role !== "user") turns.shift();
  if (turns.length === 0 || turns[turns.length - 1].role !== "user") {
    return Response.json({ error: "bad_request" }, { status: 400 });
  }

  // The instructions (and the recipe) ride along in the first user message: that works on every API
  // version, whereas a separate "systemInstruction" field is not accepted on the stable v1 endpoint.
  const instructions = body.recipe ? `${SYSTEM}\n\n${recipeContext(body.recipe)}` : SYSTEM_FREE;
  // Gemini's roles are "user" / "model".
  const contents = turns.map((turn, index) => ({
    role: turn.role === "user" ? "user" : "model",
    parts: [{ text: index === 0 ? `${instructions}\n\nשאלה: ${turn.content}` : turn.content }],
  }));

  const modelName = MODEL;
  try {
    const model = new GoogleGenerativeAI(apiKey).getGenerativeModel(
      { model: modelName, generationConfig: { maxOutputTokens: MAX_OUTPUT_TOKENS, temperature: 0.5 } },
      { timeout: TIMEOUT_MS, apiVersion: "v1" }
    );
    // The AbortSignal cancels the HTTP request itself; the race is the backstop.
    const result = await withTimeout(
      model.generateContent({ contents }, { signal: AbortSignal.timeout(TIMEOUT_MS) }),
      TIMEOUT_MS,
      `timeout after ${TIMEOUT_MS / 1000}s`
    );
    if (result.response.promptFeedback?.blockReason) {
      return Response.json({ answer: "מצטער, לא אוכל לענות על זה. אפשר לנסות לנסח את השאלה אחרת." });
    }
    let answer = "";
    try {
      answer = result.response.text().trim();
    } catch {
      // a response cut off by a safety filter has no text
    }
    if (answer) return Response.json({ answer });
    return Response.json({ error: "failed", detail: `${modelName}: empty answer (finishReason: ${result.response.candidates?.[0]?.finishReason ?? "unknown"})` }, { status: 502 });
  } catch (error) {
    const status = statusOf(error);
    const message = String((error as Error | null)?.message ?? error).slice(0, 400);
    console.error(`[chef] Gemini request failed (model ${modelName}, status ${status ?? "none"}):`, message);
    const detail = `${modelName}: ${status ? `[${status}] ` : ""}${message}`.slice(0, 400);
    if (/timeout|abort/i.test(message)) return Response.json({ error: "timeout", detail }, { status: 504 });
    if (isKeyProblem(status, message)) return Response.json({ error: "bad_key", detail }, { status: 502 });
    if (status === 429) return Response.json({ error: "busy", detail }, { status: 429 });
    return Response.json({ error: "failed", detail }, { status: 502 });
  }
}

function withTimeout<T>(promise: Promise<T>, ms: number, message: string): Promise<T> {
  let timer: ReturnType<typeof setTimeout>;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error(message)), ms);
  });
  return Promise.race([promise, timeout]).finally(() => clearTimeout(timer));
}

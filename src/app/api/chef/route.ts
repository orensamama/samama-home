import { GoogleGenerativeAI } from "@google/generative-ai";
import { rankChatModels, type ListedModel } from "@/lib/geminiModels";

// "Ask the Chef": answers cooking questions (about ONE recipe, or free-standing) with Google Gemini
// (free tier). The API key stays on the server (GEMINI_API_KEY in the Vercel project settings) and
// never reaches the browser.
//
// Built to be FAST: a short prompt and a short answer, and a hard time cap -- when Gemini doesn't
// answer in time the visitor gets a short error, not a hang. Generation goes through the official SDK.
// The model is gemini-2.5-flash-lite. If Google answers 404 ("no longer available to new users", model
// not found) the chef asks Google's ListModels which models THIS key can use (the SDK has no
// ListModels call, so it is one small authenticated REST GET) and tries those that support
// generateContent. The model that worked is remembered, so ListModels isn't called on every request.
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

// The only hard-coded model. No gemini-1.5-* and no gemini-2.5-flash: Google has retired or closed them
// to new users. The GEMINI_MODEL environment variable is deliberately NOT read: a stale value left in
// the project settings must never decide which model the chef calls.
const PRIMARY_MODEL = "gemini-2.5-flash-lite";
const TIMEOUT_MS = 8000; // one model call
const DEADLINE_MS = 12000; // the whole request: 404 hops and ListModels included
const LIST_TIMEOUT_MS = 3000;
const MAX_ATTEMPTS = 4;
const WORKING_TTL_MS = 60 * 60 * 1000;
const LIST_TTL_MS = 10 * 60 * 1000;

// The model that last answered: later requests go straight to it, with no ListModels.
let working: { at: number; model: string } | null = null;
let listed: { at: number; models: string[] } | null = null;

/** The models this key may use (generateContent only), best first. Cached for a few minutes. */
async function listUsableModels(apiKey: string, timeoutMs: number): Promise<string[]> {
  if (listed && Date.now() - listed.at < LIST_TTL_MS) return listed.models;
  try {
    const response = await fetch("https://generativelanguage.googleapis.com/v1beta/models?pageSize=200", {
      headers: { "x-goog-api-key": apiKey },
      signal: AbortSignal.timeout(timeoutMs),
    });
    if (!response.ok) throw new Error(`ListModels ${response.status}`);
    const data = (await response.json()) as { models?: ListedModel[] };
    const models = rankChatModels(data.models ?? []);
    if (models.length > 0) listed = { at: Date.now(), models };
    return models;
  } catch (error) {
    console.error("[chef] could not list Gemini models:", error);
    return [];
  }
}

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
  // version and model, with no separate "systemInstruction" field.
  const instructions = body.recipe ? `${SYSTEM}\n\n${recipeContext(body.recipe)}` : SYSTEM_FREE;
  // Gemini's roles are "user" / "model".
  const contents = turns.map((turn, index) => ({
    role: turn.role === "user" ? "user" : "model",
    parts: [{ text: index === 0 ? `${instructions}\n\nשאלה: ${turn.content}` : turn.content }],
  }));

  const genAI = new GoogleGenerativeAI(apiKey);
  const started = Date.now();
  // The remembered working model goes first, then the primary one. Models found with ListModels are
  // appended to the queue if (and only if) one of these answers 404.
  const queue: string[] = [];
  if (working && Date.now() - working.at < WORKING_TTL_MS) queue.push(working.model);
  if (!queue.includes(PRIMARY_MODEL)) queue.push(PRIMARY_MODEL);
  let discovered = false;
  let lastDetail = "";
  let lastStatus: number | undefined;
  let lastMessage = "";

  for (let index = 0; index < queue.length && index < MAX_ATTEMPTS; index++) {
    const modelName = queue[index];
    const remaining = Math.min(TIMEOUT_MS, DEADLINE_MS - (Date.now() - started));
    if (remaining < 1000) break;
    try {
      // The official SDK, default endpoint: getGenerativeModel({ model }) and generateContent.
      const model = genAI.getGenerativeModel({ model: modelName, generationConfig: { maxOutputTokens: MAX_OUTPUT_TOKENS, temperature: 0.5 } });
      // The AbortSignal cancels the HTTP request itself; the race is the backstop.
      const result = await withTimeout(
        model.generateContent({ contents }, { signal: AbortSignal.timeout(remaining), timeout: remaining }),
        remaining,
        `timeout after ${Math.round(remaining / 1000)}s`
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
      if (answer) {
        working = { at: Date.now(), model: modelName };
        return Response.json({ answer });
      }
      return Response.json({ error: "failed", detail: `${modelName}: empty answer (finishReason: ${result.response.candidates?.[0]?.finishReason ?? "unknown"})` }, { status: 502 });
    } catch (error) {
      lastStatus = statusOf(error);
      lastMessage = String((error as Error | null)?.message ?? error).slice(0, 400);
      lastDetail = `${modelName}: ${lastStatus ? `[${lastStatus}] ` : ""}${lastMessage}`.slice(0, 400);
      console.error(`[chef] Gemini request failed (model ${modelName}, status ${lastStatus ?? "none"}):`, lastMessage);
      // Only "model not found / no longer available" moves on to another model; a timeout, a bad key or
      // a busy service would fail the same way with any of them.
      if (lastStatus !== 404) break;
      if (working?.model === modelName) working = null;
      if (listed?.models.includes(modelName)) listed = null; // the list was wrong about this one
      if (!discovered) {
        discovered = true;
        const budget = Math.max(500, Math.min(LIST_TIMEOUT_MS, DEADLINE_MS - (Date.now() - started) - 1000));
        const usable = await listUsableModels(apiKey, budget);
        for (const name of usable) if (!queue.includes(name)) queue.push(name);
        console.log("[chef] models this key can use (best first):", usable.join(", ") || "(none)");
      }
    }
  }

  if (!lastMessage) return Response.json({ error: "timeout", detail: "no time left" }, { status: 504 });
  if (/timeout|abort/i.test(lastMessage)) return Response.json({ error: "timeout", detail: lastDetail }, { status: 504 });
  if (isKeyProblem(lastStatus, lastMessage)) return Response.json({ error: "bad_key", detail: lastDetail }, { status: 502 });
  if (lastStatus === 429) return Response.json({ error: "busy", detail: lastDetail }, { status: 429 });
  if (lastStatus === 404) {
    return Response.json({ error: "failed", detail: `אין מודל זמין למפתח הזה (נוסו עד ${MAX_ATTEMPTS}). ${lastDetail}`.slice(0, 400) }, { status: 502 });
  }
  return Response.json({ error: "failed", detail: lastDetail }, { status: 502 });
}

function withTimeout<T>(promise: Promise<T>, ms: number, message: string): Promise<T> {
  let timer: ReturnType<typeof setTimeout>;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error(message)), ms);
  });
  return Promise.race([promise, timeout]).finally(() => clearTimeout(timer));
}

import { GoogleGenerativeAI } from "@google/generative-ai";

// "Ask the Chef": answers questions about ONE recipe (substitutions, other appliances,
// making it dairy-free...) with Google Gemini (free tier). The API key stays on the server
// (GEMINI_API_KEY in the Vercel project settings) and never reaches the browser.
//
// This route has no sign-in, like the rest of the app, so it is limited: short questions,
// a short history, a bounded recipe, and a per-visitor rate limit -- enough to stop a
// stray script from running up the bill, not a substitute for real authentication.

export const maxDuration = 15;

const MAX_QUESTION_CHARS = 600;
const MAX_HISTORY = 8;
const MAX_RECIPE_CHARS = 8000;
const WINDOW_MS = 10 * 60 * 1000;
const MAX_REQUESTS_PER_WINDOW = 20;

// One model: GEMINI_MODEL if set, else gemini-2.5-flash, called on the stable v1 endpoint. No other
// model names are used. The first try is capped so a retry (for a passing overload) has time left,
// and the whole request has one deadline: it can never hang, it always ends with an answer or a
// JSON error.
const DEFAULT_MODEL = "gemini-2.5-flash";
const FIRST_ATTEMPT_MS = 7000;
const DEADLINE_MS = 11000;

/** HTTP status of a Gemini SDK error ("[404 Not Found] ..." when the status field isn't set). */
function statusOf(error: unknown): number | undefined {
  const direct = (error as { status?: unknown } | null)?.status;
  if (typeof direct === "number") return direct;
  const match = String((error as Error | null)?.message ?? "").match(/\[(\d{3})\s/);
  return match ? Number(match[1]) : undefined;
}

/** The key itself is the problem: no other model will do better. */
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

const SYSTEM = `אתה "השף" - עוזר קולינרי חם ומקצועי במטבח של משפחה ישראלית. אתה עונה על שאלות על המתכון הנוכחי בלבד.

כללים:
- ענה בעברית, קצר וממוקד (עד כ-120 מילים, אלא אם ביקשו פירוט), בלי הקדמות ובלי חזרה על השאלה.
- התבסס על המצרכים ועל אופן ההכנה של המתכון שמופיע למטה. כשמציעים תחליף או שינוי - אמור בדיוק מה מחליפים ובאיזו כמות, ומה ישתנה בטעם או במרקם.
- כשרות: כשמבקשים "פרווה" - החלף חלב, חמאה וגבינה בתחליפים לא-חלביים (חלב צמחי, שמן, מרגרינה פרווה) והזכר אם יש הפרדה בין בשרי לחלבי. אל תציע לערבב בשר וחלב.
- כלים: כשמבקשים להכין בנינג'ה / איר פרייר / סיר לחץ / תנור - תן טמפרטורה, זמן והתאמות קצרות, וציין שזו הערכה שכדאי לבדוק.
- אל תמציא מצרכים שאינם במתכון, אלא אם מדובר בהצעת תחליף מפורשת.
- שאלה שלא קשורה לבישול או למתכון - אמור בנימוס שאתה כאן בשביל המתכון.`;

// Free-standing chef (opened from the recipes screen, no recipe): a general cooking assistant.
const SYSTEM_FREE = `אתה "השף" - עוזר קולינרי חם ומקצועי במטבח של משפחה ישראלית. ענה על שאלות בישול, רטבים, תחליפים, טכניקות וכלים.

כללים:
- ענה בעברית, קצר וממוקד (עד כ-150 מילים, אלא אם ביקשו פירוט), בלי הקדמות ובלי חזרה על השאלה.
- כשרות: אל תציע לערבב בשר וחלב; כשצריך, הצע תחליפים פרווה.
- כשמבקשים מתכון (רוטב, ויניגרט, מנה) - כתוב אותו כך, כדי שאפשר יהיה לשמור אותו: שורה ראשונה = שם המנה בלבד; אחריה "מצרכים:" ובכל שורה מצרך עם כמות; אחריה "אופן ההכנה:" עם שלבים ממוספרים. בלי אימוג'ים ובלי הקדמה.
- שאלה שלא קשורה לבישול - אמור בנימוס שאתה כאן בשביל המטבח.`;

function recipeContext(recipe: NonNullable<ChefRequest["recipe"]>): string {
  const lines = [
    `שם המתכון: ${recipe.title ?? ""}`,
    recipe.servings ? `מספר מנות: ${recipe.servings}` : "",
    "מצרכים:",
    ...(recipe.ingredients ?? []).map((line) => `- ${line}`),
    "אופן ההכנה:",
    recipe.instructions ?? "",
    recipe.tips ? `טיפים: ${recipe.tips}` : "",
  ];
  return lines.filter(Boolean).join("\n").slice(0, MAX_RECIPE_CHARS);
}

/** Whatever goes wrong inside, the caller gets valid JSON back -- never a hung or empty response. */
export async function POST(request: Request) {
  try {
    return await handle(request);
  } catch (error) {
    console.log(error);
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
  const instructions = body.recipe ? `${SYSTEM}\n\n--- המתכון ---\n${recipeContext(body.recipe)}` : SYSTEM_FREE;
  // Gemini's roles are "user" / "model".
  const contents = turns.map((turn, index) => ({
    role: turn.role === "user" ? "user" : "model",
    parts: [{ text: index === 0 ? `${instructions}\n\n--- השאלה ---\n${turn.content}` : turn.content }],
  }));
  const genAI = new GoogleGenerativeAI(apiKey);

  const started = Date.now();
  // One model (GEMINI_MODEL or gemini-2.5-flash); a second try of the same model only for a passing failure.
  const modelName = process.env.GEMINI_MODEL || DEFAULT_MODEL;
  const attempts: { model: string; status?: number; message: string }[] = [];

  for (let index = 0; index < 2; index++) {
    const left = DEADLINE_MS - (Date.now() - started);
    // Leave a retry time to run: the first try gets at most FIRST_ATTEMPT_MS.
    const remaining = index === 0 ? Math.min(left, FIRST_ATTEMPT_MS) : left;
    if (remaining < 1000) break;
    try {
      const model = genAI.getGenerativeModel(
        {
          model: modelName,
          generationConfig: { maxOutputTokens: 2048, temperature: 0.6 },
        },
        // The stable v1 endpoint (not v1beta); the SDK aborts the HTTP request itself after `timeout`.
        { timeout: remaining, apiVersion: "v1" }
      );
      // Belt and braces: even if the SDK's own timeout didn't fire, never wait past the deadline.
      const result = await withTimeout(model.generateContent({ contents }), remaining, `timeout after ${Math.round(remaining / 1000)}s`);
      const blocked = result.response.promptFeedback?.blockReason;
      if (blocked) return Response.json({ answer: "מצטער, לא אוכל לענות על זה. אפשר לנסות לנסח את השאלה אחרת." });
      let answer = "";
      try {
        answer = result.response.text().trim();
      } catch {
        // a response cut off by a safety filter has no text
      }
      if (answer) return Response.json({ answer });
      attempts.push({ model: modelName, message: `empty answer (finishReason: ${result.response.candidates?.[0]?.finishReason ?? "unknown"})` });
    } catch (error) {
      const status = statusOf(error);
      const message = String((error as Error | null)?.message ?? error).slice(0, 400);
      attempts.push({ model: modelName, status, message });
      console.log(error);
      console.error(`[chef] Gemini request failed (model ${modelName}, status ${status ?? "none"}):`, message);
      // Only a passing problem (overloaded 429/5xx, slow) is worth one more try; a bad key, a missing
      // model (404) or a rejected request (400) will fail the same way again.
      if (isKeyProblem(status, message) || status === 404 || status === 400) break;
    }
  }

  const last = attempts[attempts.length - 1];
  console.error("[chef] failed:", JSON.stringify(attempts));
  const detail = last ? `${last.model}: ${last.status ? `[${last.status}] ` : ""}${last.message}`.slice(0, 400) : "no time left";
  if (!last || /timeout/i.test(last.message)) return Response.json({ error: "timeout", detail }, { status: 504 });
  if (isKeyProblem(last.status, last.message)) return Response.json({ error: "bad_key", detail }, { status: 502 });
  if (last.status === 429) return Response.json({ error: "busy", detail }, { status: 429 });
  return Response.json({ error: "failed", detail }, { status: 502 });
}

function withTimeout<T>(promise: Promise<T>, ms: number, message: string): Promise<T> {
  let timer: ReturnType<typeof setTimeout>;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error(message)), ms);
  });
  return Promise.race([promise, timeout]).finally(() => clearTimeout(timer));
}

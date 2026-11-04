import { GoogleGenerativeAI } from "@google/generative-ai";
import { rankFlashModels, type ListedModel } from "@/lib/geminiModels";

// "Ask the Chef": answers questions about ONE recipe (substitutions, other appliances,
// making it dairy-free...) with Google Gemini (free tier). The API key stays on the server
// (GEMINI_API_KEY in the Vercel project settings) and never reaches the browser.
//
// This route has no sign-in, like the rest of the app, so it is limited: short questions,
// a short history, a bounded recipe, and a per-visitor rate limit -- enough to stop a
// stray script from running up the bill, not a substitute for real authentication.

export const maxDuration = 60;

const MAX_QUESTION_CHARS = 600;
const MAX_HISTORY = 8;
const MAX_RECIPE_CHARS = 8000;
const WINDOW_MS = 10 * 60 * 1000;
const MAX_REQUESTS_PER_WINDOW = 20;

// Google retires model names (1.5 and 2.0 Flash are gone from many accounts), so the model is
// not hard-coded: GEMINI_MODEL (if set) is tried first, then the newest Flash models this key
// can actually use (asked from the API once an hour), then a few well-known names.
const STATIC_MODELS = ["gemini-2.5-flash", "gemini-2.0-flash", "gemini-1.5-flash", "gemini-2.5-flash-lite"];
const MODEL_LIST_TTL_MS = 60 * 60 * 1000;
const MAX_MODEL_ATTEMPTS = 5;

let modelCache: { at: number; ids: string[] } | null = null;

async function listUsableModels(apiKey: string): Promise<string[]> {
  if (modelCache && Date.now() - modelCache.at < MODEL_LIST_TTL_MS) return modelCache.ids;
  try {
    const response = await fetch("https://generativelanguage.googleapis.com/v1beta/models?pageSize=200", {
      headers: { "x-goog-api-key": apiKey },
    });
    if (!response.ok) throw new Error(`ListModels ${response.status}: ${(await response.text()).slice(0, 300)}`);
    const data = (await response.json()) as { models?: ListedModel[] };
    const ids = rankFlashModels(data.models ?? []);
    modelCache = { at: Date.now(), ids };
    console.log("[chef] usable Gemini flash models:", ids.join(", ") || "(none listed)");
    return ids;
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

export async function POST(request: Request) {
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
  if (!body.recipe || !Array.isArray(body.messages)) {
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

  // Gemini's roles are "user" / "model".
  const contents = turns.map((turn) => ({ role: turn.role === "user" ? "user" : "model", parts: [{ text: turn.content }] }));
  const systemInstruction = `${SYSTEM}

--- המתכון ---
${recipeContext(body.recipe)}`;
  const genAI = new GoogleGenerativeAI(apiKey);

  const candidates = Array.from(
    new Set([...(process.env.GEMINI_MODEL ? [process.env.GEMINI_MODEL] : []), ...(await listUsableModels(apiKey)).slice(0, 4), ...STATIC_MODELS])
  ).slice(0, MAX_MODEL_ATTEMPTS);

  const attempts: { model: string; status?: number; message: string }[] = [];
  for (const modelName of candidates) {
    try {
      const model = genAI.getGenerativeModel({
        model: modelName,
        systemInstruction,
        // Newer Gemini models "think" before answering and that counts against this limit: leave room.
        generationConfig: { maxOutputTokens: 4096, temperature: 0.6 },
      });
      const result = await model.generateContent({ contents });
      const blocked = result.response.promptFeedback?.blockReason;
      if (blocked) return Response.json({ answer: "מצטער, לא אוכל לענות על זה. אפשר לנסות לנסח את השאלה אחרת." });
      let answer = "";
      try {
        answer = result.response.text().trim();
      } catch {
        // a response cut off by a safety filter has no text
      }
      if (!answer) {
        attempts.push({ model: modelName, message: `empty answer (finishReason: ${result.response.candidates?.[0]?.finishReason ?? "unknown"})` });
        continue; // try the next model rather than answering with nothing
      }
      return Response.json({ answer });
    } catch (error) {
      const status = statusOf(error);
      const message = String((error as Error | null)?.message ?? error).slice(0, 400);
      attempts.push({ model: modelName, status, message });
      console.log(error);
      console.error(`[chef] Gemini request failed (model ${modelName}, status ${status ?? "none"}):`, message);
      // A bad key or an exhausted quota-free account won't improve with another model; anything else might
      // (model retired -> 404, model busy -> 503, model-specific limit -> 429), so try the next one.
      if (isKeyProblem(status, message)) break;
    }
  }

  const last = attempts[attempts.length - 1];
  console.error("[chef] all attempts failed:", JSON.stringify(attempts));
  const detail = `${last?.model ?? "?"}: ${last?.status ? `[${last.status}] ` : ""}${last?.message ?? ""}`.slice(0, 400);
  if (last && isKeyProblem(last.status, last.message)) return Response.json({ error: "bad_key", detail }, { status: 502 });
  if (attempts.length > 0 && attempts.every((attempt) => attempt.status === 429)) return Response.json({ error: "busy", detail }, { status: 429 });
  return Response.json({ error: "failed", detail, tried: attempts.map((attempt) => attempt.model) }, { status: 502 });
}

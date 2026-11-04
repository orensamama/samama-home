import Anthropic from "@anthropic-ai/sdk";

// "Ask the Chef": answers questions about ONE recipe (substitutions, other appliances,
// making it dairy-free...) with Claude. The API key stays on the server
// (ANTHROPIC_API_KEY in the Vercel project settings) and never reaches the browser.
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
  if (!process.env.ANTHROPIC_API_KEY) {
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

  const client = new Anthropic();
  try {
    const response = await client.beta.messages.create({
      model: process.env.ANTHROPIC_MODEL || "claude-opus-5-5",
      max_tokens: 2000,
      // Short chat answers: low effort is plenty (and the default on this model is higher).
      output_config: { effort: "low" },
      // If a safety classifier declines, let the API retry on its default fallback model.
      betas: ["server-side-fallback-2026-07-01"],
      fallbacks: "default",
      system: `${SYSTEM}\n\n--- המתכון ---\n${recipeContext(body.recipe)}`,
      messages: turns,
    });

    if (response.stop_reason === "refusal") {
      return Response.json({ answer: "מצטער, לא אוכל לענות על זה. אפשר לנסות לנסח את השאלה אחרת." });
    }
    const answer = response.content
      .filter((block): block is Extract<typeof block, { type: "text" }> => block.type === "text")
      .map((block) => block.text)
      .join("\n")
      .trim();
    return Response.json({ answer: answer || "לא הצלחתי לנסח תשובה. נסו לשאול שוב." });
  } catch (error) {
    console.error("[chef] Claude API error:", error);
    if (error instanceof Anthropic.AuthenticationError) return Response.json({ error: "bad_key" }, { status: 502 });
    if (error instanceof Anthropic.RateLimitError) return Response.json({ error: "busy" }, { status: 429 });
    return Response.json({ error: "failed" }, { status: 502 });
  }
}

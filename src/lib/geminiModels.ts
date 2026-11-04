// Picks which Gemini model to call. Google retires model names regularly (1.5 and 2.0
// Flash are gone from many accounts), so instead of hard-coding one the chef asks the API
// which models this key can use and prefers the newest stable Flash. Pure, so it can be
// tested without a key.

export type ListedModel = { name?: string; supportedGenerationMethods?: string[] };

// Preview / experimental / media-only variants are skipped: they come and go, or can't chat.
const SKIP = /preview|exp|image|tts|live|thinking|audio|vision|embedding|robotics|computer|learnlm|latest/i;

/**
 * Flash models that can generate text, best first: newest version first, and at the same
 * version the regular model before its "lite" sibling. Returns bare ids ("gemini-2.5-flash").
 */
export function rankFlashModels(models: ListedModel[]): string[] {
  const ranked: { id: string; version: number; lite: boolean }[] = [];
  for (const model of models) {
    const id = (model.name ?? "").replace(/^models\//, "");
    const match = id.match(/^gemini-(\d+(?:\.\d+)?)-flash(-lite)?$/);
    if (!match || SKIP.test(id)) continue;
    if (model.supportedGenerationMethods && !model.supportedGenerationMethods.includes("generateContent")) continue;
    ranked.push({ id, version: Number(match[1]), lite: Boolean(match[2]) });
  }
  ranked.sort((a, b) => b.version - a.version || Number(a.lite) - Number(b.lite));
  return Array.from(new Set(ranked.map((entry) => entry.id)));
}

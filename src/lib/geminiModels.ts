// Picks fallback Gemini models. Google retires or restricts model names ("no longer available to new
// users"), so when the requested model returns 404 the chef asks the API which models this key can
// use and tries the "flash" ones, newest first. Pure, so it can be tested without a key.

export type ListedModel = { name?: string; supportedGenerationMethods?: string[] };

// Preview / experimental / media-only variants are skipped: they come and go, or can't chat.
const SKIP = /preview|exp|image|tts|live|thinking|audio|vision|embedding|robotics|computer|learnlm|latest/i;

/**
 * Models whose name contains "flash" and that support generateContent, best first: newest version
 * first, and at the same version the regular model before its "lite" sibling. Bare ids
 * ("gemini-2.5-flash"), no "models/" prefix.
 */
export function rankFlashModels(models: ListedModel[]): string[] {
  const ranked: { id: string; version: number; lite: boolean }[] = [];
  for (const model of models) {
    const id = (model.name ?? "").replace(/^models\//, "");
    if (!/flash/i.test(id) || SKIP.test(id)) continue;
    if (model.supportedGenerationMethods && !model.supportedGenerationMethods.includes("generateContent")) continue;
    const version = Number(id.match(/gemini-(\d+(?:\.\d+)?)/)?.[1] ?? 0);
    ranked.push({ id, version, lite: /lite/i.test(id) });
  }
  ranked.sort((a, b) => b.version - a.version || Number(a.lite) - Number(b.lite));
  return Array.from(new Set(ranked.map((entry) => entry.id)));
}

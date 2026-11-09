// Picks the Gemini models the chef may try. Google retires or restricts model names ("no longer available
// to new users"), so when the fixed model answers 404 the chef asks the API which models this key can
// use. Pure, so it can be tested without a key.

export type ListedModel = { name?: string; supportedGenerationMethods?: string[] };

// Preview / experimental / media-only variants are skipped: they come and go, or can't chat.
const SKIP = /preview|exp|image|tts|live|thinking|audio|vision|embedding|robotics|computer|learnlm|latest|gemma|aqa/i;

/**
 * The models that support generateContent, best first for a chat assistant that must answer fast:
 * "flash-lite" first, then the other "flash" models (newest version first), then anything else
 * from the Gemini family. Bare ids ("gemini-2.5-flash-lite"), no "models/" prefix.
 */
export function rankChatModels(models: ListedModel[]): string[] {
  const ranked: { id: string; tier: number; version: number }[] = [];
  for (const model of models) {
    const id = (model.name ?? "").replace(/^models\//, "");
    if (!/^gemini-/i.test(id) || SKIP.test(id)) continue;
    if (!model.supportedGenerationMethods?.includes("generateContent")) continue;
    const tier = /flash.*lite|lite.*flash/i.test(id) ? 0 : /flash/i.test(id) ? 1 : 2;
    const version = Number(id.match(/gemini-(\d+(?:\.\d+)?)/)?.[1] ?? 0);
    ranked.push({ id, tier, version });
  }
  ranked.sort((a, b) => a.tier - b.tier || b.version - a.version);
  return Array.from(new Set(ranked.map((entry) => entry.id)));
}

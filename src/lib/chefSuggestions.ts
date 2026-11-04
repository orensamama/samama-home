// Quick questions for "ask the chef", made from THIS recipe's ingredients: a meat dish is never
// offered "make it parve", a spice it actually uses is offered as a substitution, and so on.
// Pure (no imports) so it can be tested in Node.

type RecipeLike = { title: string; ingredients: string[]; instructions: string; servings?: number | null };

const MEAT = ["בשר", "עוף", "פרגית", "פרגיות", "קציצ", "קבב", "שניצל", "הודו", "כבד", "נקניק", "סטייק", "שווארמה", "צלי", "כנפיים", "אנטריקוט", "המבורגר", "בשרי"];
const FISH = ["דג", "סלמון", "טונה", "דניס", "לברק", "אמנון", "בורי", "סרדין", "פילה"];
const DAIRY = ["חלב", "שמנת", "גבינה", "חמאה", "יוגורט", "קוטג", "מוצרלה", "פרמזן", "לבנה", "לבן", "ריקוטה", "מסקרפונה", "גבינת", "חלבי"];
const GLUTEN = ["קמח", "פסטה", "ספגטי", "לחם", "פירורי", "בצק", "קוסקוס", "בורגול", "פיתה", "לזניה", "שמרים"];
const EGGS = ["ביצה", "ביצים", "חלמון", "חלבון"];
const SPICES = ["כמון", "פפריקה", "כורכום", "קינמון", "פלפל שחור", "פלפל לבן", "כוסברה", "פטרוזיליה", "שמיר", "בזיליקום", "אורגנו", "טימין", "רוזמרין", "זעתר", "הל", "ג'ינג'ר", "אגוז מוסקט", "קארי", "סומאק", "בהרט", "צ'ילי", "מרווה", "נענע", "קימל"];

// Matches the word from its start (one attached prefix letter is allowed: "בכמון", "הביצים");
// short words (3 letters or fewer) must also end there, so "חלב" isn't found in "חלבון"
// and "הל" isn't found in "הלימון".
function has(text: string, word: string): boolean {
  const escaped = word.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const end = word.length <= 3 ? "(?![\\p{L}])" : "";
  return new RegExp("(?<![\\p{L}])[בלמהוכש]?" + escaped + end, "u").test(text);
}

function findFirst(text: string, words: string[]): string | null {
  return words.find((word) => has(text, word)) ?? null;
}

function findAll(text: string, words: string[]): string[] {
  return words.filter((word) => has(text, word));
}

/** At most `limit` questions that make sense for the recipe, most useful first. */
export function chefSuggestions(recipe: RecipeLike, limit = 4): string[] {
  const ingredients = recipe.ingredients.join(" \n ").toLowerCase();
  const title = recipe.title.toLowerCase();
  const text = `${title} \n ${ingredients}`;
  const method = recipe.instructions.toLowerCase();

  const meat = findFirst(text, MEAT) !== null;
  const fish = findFirst(text, FISH) !== null;
  const dairyWord = findFirst(ingredients, DAIRY);
  const hasGluten = findFirst(ingredients, GLUTEN) !== null;
  const hasEggs = findFirst(ingredients, EGGS) !== null;
  const spices = findAll(ingredients, SPICES);
  const isSoup = /מרק|שורבה/.test(title);
  const isSalad = /סלט/.test(title);
  const isSweet = /עוג|עוגיו|קינוח|מוס|בראוניז|פאי|גלידה/.test(title);
  const ovenOrFry = /תנור|מטגנ|טיגון|אופ|צלי|מבשל/.test(method) || meat || /פרגית|שניצל|תפוח|בטטה|קציצ/.test(text);

  const picks: string[] = [];
  const add = (question: string) => {
    if (!picks.includes(question)) picks.push(question);
  };

  // 1) A spice this recipe really uses: what could stand in for it.
  if (spices[0]) add(`מה אפשר לשים במקום ${spices[0]}?`);

  // 2) Kosher: only what makes sense for THIS dish.
  if (meat && dairyWord) add(`יש במתכון ${dairyWord}: במה להחליף אותו כדי שהמנה תהיה בשרית כשרה?`);
  else if (!meat && !fish && dairyWord) add("איך להפוך את המתכון לפרווה?");
  else if (meat) add("איך לוודא שהבשר יוצא עסיסי ולא יבש?");
  else if (fish) add("איך יודעים שהדג מוכן ולא מייבשים אותו?");

  // 3) Other cooking tools (not for soups, salads, or cold desserts).
  if (ovenOrFry && !isSoup && !isSalad && !isSweet) add("איך להכין את זה בנינג'ה / איר פרייר?");
  else if (isSweet) add("אפשר להכין את זה בלי תנור? איך?");
  else if (isSoup) add("איך להכין את זה בסיר לחץ?");

  // 4) Dietary swaps that apply to the ingredients present.
  if (hasGluten) add("איך להפוך את המתכון לללא גלוטן?");
  if (isSweet || /סוכר/.test(ingredients)) add("איך אפשר להפחית סוכר מהמתכון?");
  if (hasEggs && !meat && !fish) add("מה אפשר לשים במקום ביצים?");

  // 5) A second spice, then things that fit any dish.
  if (spices[1]) add(`מה אפשר לשים במקום ${spices[1]}?`);
  const servings = recipe.servings && recipe.servings > 0 ? recipe.servings : null;
  add(servings && servings > 2 ? `איך מכינים את זה ל-${Math.max(1, Math.round(servings / 2))} מנות?` : "איך מכפילים את המתכון לארוחה גדולה?");
  add("איך אפשר להפוך את המתכון לקל ובריא יותר?");
  add("איך שומרים או מקפיאים את זה, ואיך מחממים מחדש?");

  return picks.slice(0, limit);
}

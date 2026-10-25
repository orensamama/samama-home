// Turns a dictated Hebrew sentence ("מאה חמישים שקלים ברמי לוי") into the
// fields of an expense. Pure functions with no imports, so they're easy to test.

export type SpokenExpense = {
  amount: number | null;
  /** Best guess for the store / business name (may be empty). */
  store: string;
};

const UNITS: Record<string, number> = {
  אפס: 0,
  אחד: 1,
  אחת: 1,
  שניים: 2,
  שנים: 2,
  שתיים: 2,
  שתים: 2,
  שני: 2,
  שתי: 2,
  שלוש: 3,
  שלושה: 3,
  ארבע: 4,
  ארבעה: 4,
  חמש: 5,
  חמישה: 5,
  שש: 6,
  שישה: 6,
  שבע: 7,
  שבעה: 7,
  שמונה: 8,
  תשע: 9,
  תשעה: 9,
  עשר: 10,
  עשרה: 10,
  // construct forms used before "אלפים" ("שלושת אלפים")
  שלושת: 3,
  ארבעת: 4,
  חמשת: 5,
  ששת: 6,
  שבעת: 7,
  שמונת: 8,
  תשעת: 9,
  עשרת: 10,
};

const TENS: Record<string, number> = {
  עשרים: 20,
  שלושים: 30,
  ארבעים: 40,
  חמישים: 50,
  שישים: 60,
  שבעים: 70,
  שמונים: 80,
  תשעים: 90,
};

const CURRENCY_WORDS = new Set(["שקל", "שקלים", "שח", "ש״ח", "ש\"ח", "₪", "שקלי", "ניס", "אגורות"]);

// Words that carry no store information.
const FILLER_WORDS = new Set([
  "שילמתי", "שילמנו", "שלמתי", "שלמנו", "קניתי", "קנינו", "הוצאתי", "הוצאנו", "הוצאה", "תרשום", "רשום", "תרשמי",
  "רשמי", "בסך", "סך", "של", "על", "עוד", "היום", "אתמול", "בערך", "כמעט", "בדיוק", "בסוף", "אצל", "ב", "ל", "מ",
  "את", "עבור", "בשביל", "לקחתי", "לקחנו", "הלכתי", "הלכנו", "היה", "זה", "עלה", "עלתה", "כולל", "וגם", "ו", "תוסיף",
]);

// A leading "ב" is usually the preposition ("ברמי לוי"), unless it's the start of a real word.
const REAL_B_WORDS = /^(בית|בר|בן|בנק)$|^(בנזין|בגדים|בוטיק|ביקור|ביטוח|בילוי|ביגוד|בייביסיטר|בריאות|בישול)/;

function cleanToken(token: string): string {
  // Only the edges: "49.90" must keep its dot, "בית-קפה" its hyphen's neighbours.
  return token.replace(/^["'`׳״(\[{\-–—]+|[.,!?;:)\]}"'`׳״\-–—]+$/g, "").trim();
}

/** Strips the conjunction "ו" (as in "וחמישים") when the rest is a number word. */
function numberWord(token: string): { value: number; kind: "unit" | "tens" | "hundred" | "hundreds" | "thousand" | "thousands" | "half" | "plus" } | null {
  const candidates = [token];
  if (token.startsWith("ו") && token.length > 1) candidates.push(token.slice(1));
  for (const word of candidates) {
    if (word in UNITS) return { value: UNITS[word], kind: "unit" };
    if (word in TENS) return { value: TENS[word], kind: "tens" };
    if (word === "מאה") return { value: 100, kind: "hundred" };
    if (word === "מאתיים" || word === "מאתים") return { value: 200, kind: "hundred" };
    if (word === "מאות") return { value: 100, kind: "hundreds" };
    if (word === "אלף") return { value: 1000, kind: "thousand" };
    if (word === "אלפיים") return { value: 2000, kind: "thousand" };
    if (word === "אלפים" || word === "אלפי") return { value: 1000, kind: "thousands" };
    if (word === "חצי") return { value: 0.5, kind: "half" };
  }
  return null;
}

/** Evaluates a run of spoken-number tokens ("מאה", "חמישים") to a value. */
function evaluateNumberRun(tokens: string[]): number | null {
  let total = 0;
  let current = 0;
  let lastUnit = 0;
  let any = false;

  for (const token of tokens) {
    const word = numberWord(token);
    if (!word) return null;
    any = true;
    switch (word.kind) {
      case "unit":
        current += word.value;
        lastUnit = word.value;
        break;
      case "tens":
        current += word.value;
        lastUnit = 0;
        break;
      case "hundred":
        current += word.value;
        lastUnit = 0;
        break;
      case "hundreds":
        // "שלוש מאות": the preceding unit is multiplied.
        if (lastUnit > 0) current += lastUnit * 100 - lastUnit;
        else current += 100;
        lastUnit = 0;
        break;
      case "thousand":
        if (word.value === 2000) {
          total += 2000;
        } else {
          total += (current > 0 ? current : 1) * 1000;
          current = 0;
        }
        lastUnit = 0;
        break;
      case "thousands":
        total += (current > 0 ? current : 1) * 1000;
        current = 0;
        lastUnit = 0;
        break;
      case "half":
        current += 0.5;
        break;
      default:
        break;
    }
  }
  return any ? total + current : null;
}

/** Parses the amount (digits or Hebrew number words) and the store out of a dictated sentence. */
export function parseSpokenExpense(transcript: string): SpokenExpense {
  const tokens = transcript
    .replace(/₪/g, " ₪ ")
    .split(/\s+/)
    .map(cleanToken)
    .filter(Boolean);

  // 1. Amount: digits win ("150", "49.90", "1,250"), otherwise the first run of number words.
  let amount: number | null = null;
  const used = new Set<number>();

  for (let i = 0; i < tokens.length; i++) {
    if (/^\d+([.,]\d+)?$/.test(tokens[i])) {
      amount = Number(tokens[i].replace(",", "."));
      used.add(i);
      break;
    }
  }

  if (amount === null) {
    for (let i = 0; i < tokens.length && amount === null; i++) {
      if (!numberWord(tokens[i])) continue;
      let end = i;
      while (end + 1 < tokens.length && numberWord(tokens[end + 1])) end++;
      const value = evaluateNumberRun(tokens.slice(i, end + 1));
      if (value !== null && value > 0) {
        amount = value;
        for (let j = i; j <= end; j++) used.add(j);
      } else {
        i = end;
      }
    }
  }

  // 2. Store: whatever is left once the amount, the currency and filler words are gone.
  const remaining = tokens.filter((token, index) => !used.has(index) && !CURRENCY_WORDS.has(token));
  const words: string[] = [];
  for (const token of remaining) {
    if (FILLER_WORDS.has(token)) {
      if (words.length > 0) break; // the store name ended
      continue;
    }
    words.push(token);
  }

  if (words.length > 0) {
    const first = words[0];
    if (first.length >= 3 && first.startsWith("ב") && !REAL_B_WORDS.test(first)) words[0] = first.slice(1);
  }

  return { amount, store: words.join(" ").trim() };
}

// Keywords (most specific first) -> the budget category name they point to.
const CATEGORY_KEYWORDS: { keywords: string[]; category: string }[] = [
  { keywords: ["סופר פארם", "סופר-פארם", "ניו פארם", "פארם", "בית מרקחת"], category: "סופר פארם" },
  { keywords: ["מסעדה", "בית קפה", "קפה", "פיצה", "שווארמה", "המבורגר", "ארוחה", "וולט", "תן ביס", "סושי", "פלאפל", "גלידה"], category: "מסעדות ובתי קפה" },
  { keywords: ["סופר", "מכולת", "מזון", "ירקות", "פירות", "שוק", "אוכל", "מרקט", "מינימרקט"], category: "סופר/מזון" },
  { keywords: ["בנזין", "דלק", "תדלוק", "סונול", "פז"], category: "דלק" },
  { keywords: ["אוטובוס", "רכבת", "רב קו", "מונית", "גט"], category: "תחבורה ציבורית" },
  { keywords: ["כביש 6", "כביש שש"], category: "כביש 6" },
  { keywords: ["חניה", "חנייה", "חניון", "פנגו"], category: "חניונים" },
  { keywords: ["חיתולים", "טיטולים", "פמפרס", "תמ\"ל", "מטרנה", "תינוק"], category: "מוצרי תינוקות" },
  { keywords: ["מספרה", "תספורת"], category: "מספרה" },
  { keywords: ["קוסמטיקה", "קוסמטיקאית", "ציפורניים", "מניקור"], category: "קוסמטיקה" },
  { keywords: ["קולנוע", "סרט", "הצגה", "מופע", "בילוי", "כרטיסים"], category: "בילויים ומופעים" },
  { keywords: ["צעצוע", "צעצועים", "משחק"], category: "צעצועים" },
  { keywords: ["מתנה", "מתנות", "יום הולדת"], category: "מתנות" },
  { keywords: ["ג'ימבורי", "גימבורי"], category: "ג'ימבורי" },
  { keywords: ["חשמל"], category: "חשמל" },
  { keywords: ["מים"], category: "מים" },
  { keywords: ["גז"], category: "גז" },
  { keywords: ["ארנונה"], category: "ארנונה" },
  { keywords: ["נטפליקס", "netflix"], category: "נטפליקס" },
  { keywords: ["אמזון", "עלי אקספרס", "אליאקספרס", "שיין", "אונליין"], category: 'קניות בחו"ל/אונליין' },
  { keywords: ["חופשה", "טיסה", "מלון"], category: "חופשות" },
];

/**
 * The budget category *name* a sentence points to ("דלק" for "בנזין בפז"), or
 * null. The caller maps it to a category id (and tries remembered stores first).
 */
export function categoryNameForText(text: string): string | null {
  const normalize = (value: string) => value.toLowerCase().replace(/["'`׳״.,!?]/g, "");
  const haystack = normalize(text);
  const words = haystack.split(/\s+/).filter(Boolean);
  // Whole-word match, tolerating one attached Hebrew prefix ("בפז", "לסופר").
  const hasWord = (needle: string) =>
    words.some((word) => word === needle || (word.length > needle.length && /^[בלמהוכש]/.test(word) && word.slice(1) === needle));

  for (const { keywords, category } of CATEGORY_KEYWORDS) {
    for (const keyword of keywords) {
      const needle = normalize(keyword);
      if (needle.includes(" ") ? haystack.includes(needle) : hasWord(needle)) return category;
    }
  }
  return null;
}

import { OTHER_CATEGORY, SHOPPING_CATEGORIES, type MasterProduct } from "@/lib/shoppingData";

// Words that point at a shopping category, so the quick-add sheet can pre-select the likely one
// (the user still confirms with a tap).
const KEYWORDS: { category: (typeof SHOPPING_CATEGORIES)[number]; words: string[] }[] = [
  {
    category: "ירקות ופירות",
    words: ["חציל", "עגבני", "מלפפון", "בצל", "שום", "גזר", "תפוח", "בטטה", "פלפל", "קישוא", "כרוב", "חסה", "לימון", "תפוז", "בננה", "אבוקדו", "פטרוזיליה", "כוסברה", "נענע", "שמיר", "ענבים", "אפרסק", "תות", "אבטיח", "מלון", "פטריות", "ברוקולי", "כרובית", "סלק", "תירס", "דלעת", "ירק", "פרי"],
  },
  { category: "חלב וביצים", words: ["חלב", "גבינה", "יוגורט", "שמנת", "חמאה", "ביצ", "קוטג", "לבן", "מוצרלה", "מרגרינה", "שוקו"] },
  { category: "בשר, עוף ודגים", words: ["בשר", "עוף", "פרגית", "שניצל", "דג", "סלמון", "טונה", "נקניק", "קבב", "קציצ", "המבורגר", "כבד", "הודו", "סטייק", "אנטריקוט"] },
  { category: "יבשים, מוצרי מזווה ואפייה", words: ["קמח", "סוכר", "אורז", "פסטה", "שמן", "מלח", "תבלין", "פירורי", "שמרים", "אבקת", "קוסקוס", "עדשים", "חומוס", "שעועית", "רסק", "קטשופ", "מיונז", "חרדל", "טחינה", "דבש", "ריבה", "קורנפלקס", "שימורים", "פתיתים", "בורגול"] },
  { category: "שתייה, חטיפים ומתוקים", words: ["מיץ", "קולה", "מים", "בירה", "יין", "שוקולד", "במבה", "ביסלי", "חטיף", "עוגיות", "גלידה", "סודה", "קפה", "תה", "ממתק", "וופל"] },
  { category: "פארם, תינוקות ואישי", words: ["שמפו", "סבון", "משחת", "מברשת", "חיתול", "טישו", "דאודורנט", "קרם", "תרופה", "ויטמין", "פמפרס", "מגבונים", "סכין גילוח"] },
  { category: "ניקיון ותחזוקה", words: ["אקונומיקה", "נוזל כלים", "אבקת כביסה", "מרכך", "שקיות", "נייר", "ספוג", "מנקה", "סנו", "נייר טואלט", "מטליות"] },
];

/**
 * The shopping category a new product probably belongs in: the category of a similar product that's
 * already in the arsenal, else a keyword guess; null when there's no good guess.
 */
export function guessShoppingCategory(name: string, products: MasterProduct[] = []): string | null {
  const text = name.trim().toLowerCase();
  if (!text) return null;
  const similar = products.find((product) => {
    const other = product.name.trim().toLowerCase();
    return other.length >= 3 && (other.includes(text) || text.includes(other));
  });
  if (similar && similar.category && similar.category !== OTHER_CATEGORY) return similar.category;
  for (const { category, words } of KEYWORDS) {
    if (words.some((word) => text.includes(word))) return category;
  }
  return null;
}

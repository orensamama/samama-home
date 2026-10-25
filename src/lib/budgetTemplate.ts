import type { BudgetKind } from "@/lib/budgetData";

// The family Excel's base template. Mirrors the seed in migration 0016, so a
// database that somehow has no categories (fresh project, wiped table) gets
// the same structure automatically on first load. Budgets start at 0 -- the
// family fills in its own targets in the UI.
const GROUPS: { kind: BudgetKind; group: string; items: string[] }[] = [
  { kind: "income", group: "הכנסות", items: ["משכורת אורן", "משכורת אורית", "קצבת ילדים", "הכנסה מנכסים/עסק", "אחר"] },
  { kind: "fixed", group: "דיור", items: ['שכ"ד/משכנתא', "ארנונה", "ועד בית", "ביטוח מבנה"] },
  { kind: "fixed", group: "חינוך וחוגים", items: ["מעון/משפחתון", "בייביסיטר", "ועד הורים", "ספורט/חוגים"] },
  { kind: "fixed", group: "תחבורה קבועה", items: ["ביטוח חובה", "ביטוח מקיף", "רישיון רכב/טסט", "תיקוני רכב", "אחריות סוללה"] },
  { kind: "fixed", group: "בריאות וטיפולים", items: ["קופת חולים", "תרופות קבועות", "טיפולים"] },
  { kind: "fixed", group: "תקשורת ומנויים", items: ["אפל", "גוגל", "נטפליקס", "אינטרנט"] },
  { kind: "fixed", group: "פיננסי וביטוחים", items: ["עמלות כרטיס אשראי", "תחזוקת עסק", "ביטוחי בריאות"] },
  { kind: "variable", group: "מזון ובית", items: ["סופר/מזון", "מסעדות ובתי קפה"] },
  { kind: "variable", group: "תחבורה משתנה", items: ["דלק", "תחבורה ציבורית", "כביש 6", "חניונים"] },
  { kind: "variable", group: "חשבונות בית", items: ["חשמל", "מים", "גז", "העברות כספים (ביט/פייבוקס)"] },
  { kind: "variable", group: "קוסמטיקה, פארם ותינוקות", items: ["סופר פארם", "מוצרי תינוקות", "מספרה", "קוסמטיקה"] },
  {
    kind: "variable",
    group: "תרבות, פנאי ומתנות",
    items: ["בילויים ומופעים", "צעצועים", "מתנות", "ג'ימבורי", 'קניות בחו"ל/אונליין'],
  },
  { kind: "sinking", group: "אחת לתקופה", items: ["חופשות", "פסח", "חגים", "ציוד לימודים/חופש גדול"] },
];

export const BUDGET_TEMPLATE_ROWS = GROUPS.flatMap(({ kind, group, items }) =>
  items.map((name) => ({ name, kind, group_name: group }))
).map((row, index) => ({ ...row, monthly_budget: 0, sort_order: (index + 1) * 10 }));

// Common stores -> category name, so recognition works from day one.
export const DEFAULT_MERCHANTS: { store_key: string; store_name: string; category: string }[] = [
  { store_key: "רמי לוי", store_name: "רמי לוי", category: "סופר/מזון" },
  { store_key: "שופרסל", store_name: "שופרסל", category: "סופר/מזון" },
  { store_key: "יוחננוף", store_name: "יוחננוף", category: "סופר/מזון" },
  { store_key: "ויקטורי", store_name: "ויקטורי", category: "סופר/מזון" },
  { store_key: "מגה", store_name: "מגה", category: "סופר/מזון" },
  { store_key: "טיב טעם", store_name: "טיב טעם", category: "סופר/מזון" },
  { store_key: "אושר עד", store_name: "אושר עד", category: "סופר/מזון" },
  { store_key: "סופר פארם", store_name: "סופר פארם", category: "סופר פארם" },
  { store_key: "ניו פארם", store_name: "ניו פארם", category: "סופר פארם" },
  { store_key: "פז", store_name: "פז", category: "דלק" },
  { store_key: "סונול", store_name: "סונול", category: "דלק" },
  { store_key: "דור אלון", store_name: "דור אלון", category: "דלק" },
  { store_key: "דלק", store_name: "דלק", category: "דלק" },
  { store_key: "ארומה", store_name: "ארומה", category: "מסעדות ובתי קפה" },
  { store_key: "קפה גרג", store_name: "קפה גרג", category: "מסעדות ובתי קפה" },
  { store_key: "מקדונלדס", store_name: "מקדונלדס", category: "מסעדות ובתי קפה" },
  { store_key: "נטפליקס", store_name: "נטפליקס", category: "נטפליקס" },
  { store_key: "netflix", store_name: "Netflix", category: "נטפליקס" },
  { store_key: "כביש 6", store_name: "כביש 6", category: "כביש 6" },
  { store_key: "פנגו", store_name: "פנגו", category: "חניונים" },
  { store_key: "אחוזות החוף", store_name: "אחוזות החוף", category: "חניונים" },
];

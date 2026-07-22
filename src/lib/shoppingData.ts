export type MasterProduct = {
  id: string;
  name: string;
  category: string;
  default_qty: number;
};

export type ShoppingItem = {
  id: string;
  product_id: string | null;
  title: string;
  category: string | null;
  completed: boolean;
  in_cart: boolean;
};

// Order matters: this is the display order used everywhere (Arsenal
// browsing, add-form dropdown, Live Shopping Mode grouping), matching a
// natural supermarket walking route.
export const SHOPPING_CATEGORIES = [
  "ירקות ופירות",
  "יבשים, מוצרי מזווה ואפייה",
  "חלב וביצים",
  "בשר, עוף ודגים",
  "שתייה, חטיפים ומתוקים",
  "פארם, תינוקות ואישי",
  "ניקיון ותחזוקה",
  "אחר",
] as const;

export const OTHER_CATEGORY = "אחר";

export function groupByCategory<T extends { category: string | null }>(
  items: T[]
): { category: string; items: T[] }[] {
  const groups = new Map<string, T[]>();
  for (const item of items) {
    const key = item.category?.trim() || OTHER_CATEGORY;
    const list = groups.get(key);
    if (list) {
      list.push(item);
    } else {
      groups.set(key, [item]);
    }
  }

  const orderIndex = (category: string) => {
    const index = SHOPPING_CATEGORIES.indexOf(category as (typeof SHOPPING_CATEGORIES)[number]);
    return index === -1 ? SHOPPING_CATEGORIES.length : index;
  };

  return Array.from(groups.entries())
    .map(([category, items]) => ({ category, items }))
    .sort((a, b) => orderIndex(a.category) - orderIndex(b.category));
}

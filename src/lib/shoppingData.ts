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

export const SHOPPING_CATEGORIES = [
  "מוצרי חלב",
  "ירקות ופירות",
  "בשר ודגים",
  "מאפים",
  "מזווה",
  "ניקיון",
  "טיפוח והיגיינה",
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
  return Array.from(groups.entries()).map(([category, items]) => ({ category, items }));
}

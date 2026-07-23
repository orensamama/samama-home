export type ParsedShoppingLine = {
  name: string;
  qty: number;
};

// Numbered-list markers ("1. ", "2) ", "3: ") -- checked before the generic
// bullet strip so a leading digit used as list numbering isn't later
// mistaken for a quantity.
const NUMBERED_PREFIX = /^\d+[.):]\s*/;
// Bullets/dashes/asterisks a chat client renders for list items.
const BULLET_PREFIX = /^[\s\-*•·–—>]+/;
// "לחם x2" / "לחם X2" / "לחם ×2"
const TRAILING_X_QTY = /[×xX]\s*(\d+)\s*$/;
// "3 עגבניות"
const LEADING_QTY = /^(\d+)\s+/;
// "חלב 2" -- only strips if something remains before the number, so a
// lone "5" doesn't get treated as a quantity with no product name.
const TRAILING_QTY = /(?:^|\s)(\d+)\s*$/;

function stripDecoration(raw: string): string {
  return raw.trim().replace(NUMBERED_PREFIX, "").replace(BULLET_PREFIX, "").trim();
}

/**
 * Best-effort parse of free-form pasted text (e.g. a WhatsApp message) into
 * shopping items with quantities. Splits on newlines and commas, strips
 * list decoration, and pulls a quantity off the front or back of each
 * fragment when one is present -- defaulting to 1 otherwise. Duplicate
 * product names (case-insensitive) are merged, summing their quantities.
 */
export function parseShoppingText(text: string): ParsedShoppingLine[] {
  const fragments = text.split(/[\n,]+/);
  const merged = new Map<string, ParsedShoppingLine>();

  for (const fragment of fragments) {
    let line = stripDecoration(fragment);
    if (!line) continue;

    let qty = 1;
    const xMatch = line.match(TRAILING_X_QTY);
    if (xMatch && xMatch.index !== undefined) {
      qty = parseInt(xMatch[1], 10);
      line = line.slice(0, xMatch.index).trim();
    } else {
      const leadMatch = line.match(LEADING_QTY);
      if (leadMatch) {
        qty = parseInt(leadMatch[1], 10);
        line = line.slice(leadMatch[0].length).trim();
      } else {
        const trailMatch = line.match(TRAILING_QTY);
        if (trailMatch && line.length > trailMatch[0].trim().length) {
          qty = parseInt(trailMatch[1], 10);
          line = line.slice(0, line.length - trailMatch[0].length).trim();
        }
      }
    }

    line = stripDecoration(line);
    if (!line || !Number.isFinite(qty) || qty < 1) continue;

    const key = line.toLowerCase();
    const existing = merged.get(key);
    if (existing) {
      existing.qty += qty;
    } else {
      merged.set(key, { name: line, qty });
    }
  }

  return Array.from(merged.values());
}

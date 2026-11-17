/**
 * Colour or Coat tag helpers and predefined suggestions shared across animal reporting
 * and pet registration screens.
 */

export const ANIMAL_COLOR_SUGGESTIONS = [
  'White',
  'Black',
  'Brown',
  'Tan',
  'Cream',
  'Gray',
  'Golden',
  'Orange',
  'Yellow',
  'Red',
  'Mixed',
  'Beige',
  'Ivory',
  'Buff',
  'Fawn',
  'Apricot',
  'Amber',
  'Caramel',
  'Honey',
  'Sand',
  'Chocolate',
  'Chestnut',
  'Mahogany',
  'Cinnamon',
  'Ginger',
  'Rust',
  'Copper',
  'Liver',
  'Sable',
  'Wheaten',
  'Charcoal',
  'Silver',
  'Slate',
  'Ash',
  'Blue',
  'Green',
  'Teal',
  'Pink',
  'Purple',
  'Brindle',
  'Calico',
  'Tabby',
  'Tortoiseshell',
  'Tuxedo',
  'Merle',
  'Tricolor',
  'Bicolor',
  'Spotted',
  'Striped',
  'Speckled',
  'Patched',
  'Roan',
  'Dapple',
] as const;

export function cleanColorTag(raw: string): string {
  return raw.replace(/\s+/g, ' ').trim();
}

export function normalizeColorList(items: readonly string[]): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  for (const raw of items) {
    const cleaned = cleanColorTag(raw);
    if (!cleaned) continue;
    const key = cleaned.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(cleaned);
  }
  return out;
}

/** Add one or more comma-separated colour tags, trimming spaces and skipping case-insensitive duplicates. */
export function addColorTags(existing: readonly string[], raw: string): string[] {
  const parts = raw.split(/[,;]+/).map(cleanColorTag).filter(Boolean);
  if (parts.length === 0) return normalizeColorList(existing);
  return normalizeColorList([...existing, ...parts]);
}

export function removeColorTag(existing: readonly string[], index: number): string[] {
  return existing.filter((_, i) => i !== index);
}

/** Read colour tags from an API array or fall back to a delimited legacy string on older records. */
export function parseColorTags(colors?: readonly string[] | null, fallback?: string | null): string[] {
  if (Array.isArray(colors) && colors.length > 0) {
    return normalizeColorList(colors);
  }
  const text = (fallback ?? '').trim();
  if (!text) return [];
  return addColorTags([], text);
}

export function filterColorSuggestions(existing: readonly string[], query: string): string[] {
  const q = cleanColorTag(query).toLowerCase();
  if (!q) return [];
  const chosen = new Set(existing.map((c) => cleanColorTag(c).toLowerCase()));
  const starts: string[] = [];
  const contains: string[] = [];
  for (const s of ANIMAL_COLOR_SUGGESTIONS) {
    const lower = s.toLowerCase();
    if (chosen.has(lower)) continue;
    if (lower.startsWith(q)) starts.push(s);
    else if (lower.includes(q)) contains.push(s);
  }
  return [...starts, ...contains];
}

import type { Category } from "../shared/catalogue";

// How one person likes to see the list: stars per category and which
// categories are folded. Kept on the device; it is nobody else's business.
export type Prefs = { stars: Record<string, number>; collapsed: string[] };
export type RankedCategory = Category & { stars: number; collapsed: boolean };

export const DEFAULT_STARS = 3;
const EMPTY = (): Prefs => ({ stars: {}, collapsed: [] });

type KeyValue = { getItem(k: string): string | null; setItem(k: string, v: string): void };

export function orderCategories(categories: Category[], prefs: Prefs): RankedCategory[] {
  return categories
    .map((c, i) => ({ ...c, stars: prefs.stars[c.id] ?? DEFAULT_STARS, collapsed: prefs.collapsed.includes(c.id), i }))
    .sort((a, b) => b.stars - a.stars || a.i - b.i)
    .map(({ i: _i, ...c }) => c);
}

export function setStars(prefs: Prefs, id: string, stars: number): Prefs {
  return { ...prefs, stars: { ...prefs.stars, [id]: Math.min(5, Math.max(1, Math.round(stars))) } };
}

export function toggleCollapsed(prefs: Prefs, id: string): Prefs {
  const collapsed = prefs.collapsed.includes(id) ? prefs.collapsed.filter((x) => x !== id) : [...prefs.collapsed, id];
  return { ...prefs, collapsed };
}

export function loadPrefs(storage: KeyValue, region: string): Prefs {
  try {
    const raw = JSON.parse(storage.getItem(`prefs:${region}`) ?? "null");
    const stars = raw?.stars && typeof raw.stars === "object" ? raw.stars : null;
    const okStars = stars && Object.values(stars).every((v) => Number.isInteger(v) && (v as number) >= 1 && (v as number) <= 5);
    const okCollapsed = Array.isArray(raw?.collapsed) && raw.collapsed.every((x: unknown) => typeof x === "string");
    if (!okStars || !okCollapsed) return EMPTY();
    return { stars, collapsed: raw.collapsed };
  } catch {
    return EMPTY();
  }
}

export function savePrefs(storage: KeyValue, region: string, prefs: Prefs): void {
  try {
    storage.setItem(`prefs:${region}`, JSON.stringify(prefs));
  } catch {
    // Private windows can refuse storage; the preference then lasts only
    // for this visit, which is acceptable.
  }
}

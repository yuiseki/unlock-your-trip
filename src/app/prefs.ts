// How one person likes to see the list: stars per achievement and which
// categories are folded. Folding stays on the device. Stars follow the
// writer to every device: each rating carries the time it was set, waits
// on the device until sent, and the newest rating wins.
export type Prefs = {
  stars: Record<string, number>;
  collapsed: string[];
  starTimes: Record<string, string>;
  starPending: string[];
};
export type StarRating = { achievementId: string; stars: number; updatedAt: string };

export const DEFAULT_STARS = 3;
// Ratings saved before syncing existed have no time; any rating set on a
// device since then is newer.
const BEFORE_SYNC = "1970-01-01T00:00:00.000Z";
const EMPTY = (): Prefs => ({ stars: {}, collapsed: [], starTimes: {}, starPending: [] });

type KeyValue = { getItem(k: string): string | null; setItem(k: string, v: string): void };

export function starsOf(prefs: Prefs, achievementId: string): number {
  return prefs.stars[achievementId] ?? DEFAULT_STARS;
}

const clamp = (n: number) => Math.min(5, Math.max(1, Math.round(n)));

export function setStars(prefs: Prefs, id: string, stars: number, now = new Date().toISOString()): Prefs {
  return {
    ...prefs,
    stars: { ...prefs.stars, [id]: clamp(stars) },
    starTimes: { ...prefs.starTimes, [id]: now },
    starPending: prefs.starPending.includes(id) ? prefs.starPending : [...prefs.starPending, id],
  };
}

export function pendingStars(prefs: Prefs): StarRating[] {
  return prefs.starPending
    .filter((id) => prefs.stars[id] !== undefined)
    .map((id) => ({ achievementId: id, stars: prefs.stars[id], updatedAt: prefs.starTimes[id] ?? BEFORE_SYNC }));
}

// Applied to the prefs as they are when the server answers, which may have
// changed since the request left: a rating changed again stays pending.
export function applyStarSync(prefs: Prefs, sent: StarRating[], remote: StarRating[]): Prefs {
  const stars = { ...prefs.stars };
  const starTimes = { ...prefs.starTimes };
  let pending = prefs.starPending.filter((id) => !sent.some((s) => s.achievementId === id && s.updatedAt === (starTimes[id] ?? BEFORE_SYNC)));
  for (const r of remote) {
    const local = starTimes[r.achievementId];
    if (local !== undefined && local > r.updatedAt) continue;
    stars[r.achievementId] = clamp(r.stars);
    starTimes[r.achievementId] = r.updatedAt;
    pending = pending.filter((id) => id !== r.achievementId);
  }
  return { ...prefs, stars, starTimes, starPending: pending };
}

export function toggleCollapsed(prefs: Prefs, id: string): Prefs {
  const collapsed = prefs.collapsed.includes(id) ? prefs.collapsed.filter((x) => x !== id) : [...prefs.collapsed, id];
  return { ...prefs, collapsed };
}

const isStringList = (x: unknown): x is string[] => Array.isArray(x) && x.every((v) => typeof v === "string");

export function loadPrefs(storage: KeyValue, region: string): Prefs {
  try {
    const raw = JSON.parse(storage.getItem(`prefs:${region}`) ?? "null");
    const stars = raw?.stars && typeof raw.stars === "object" ? raw.stars : null;
    const okStars = stars && Object.values(stars).every((v) => Number.isInteger(v) && (v as number) >= 1 && (v as number) <= 5);
    if (!okStars || !isStringList(raw.collapsed)) return EMPTY();
    const times = raw.starTimes && typeof raw.starTimes === "object" ? raw.starTimes : null;
    if (!times || !isStringList(raw.starPending)) {
      // Saved before syncing: every rating is old and still to be sent.
      return { stars, collapsed: raw.collapsed, starTimes: {}, starPending: Object.keys(stars) };
    }
    return { stars, collapsed: raw.collapsed, starTimes: times, starPending: raw.starPending };
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

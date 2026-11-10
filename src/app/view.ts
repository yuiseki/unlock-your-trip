import type { Achievement, Category, Image } from "../shared/catalogue";
import { distanceMeters, type LngLat } from "../shared/geo";
import { DEFAULT_STARS } from "./prefs";
import type { Unlock } from "./store";

export type ListItem = { achievement: Achievement; unlocked: boolean; unlockedAt: string | null; meters: number | null; stars: number };
export type Group = { category: string; label: string; items: ListItem[]; unlocked: number; total: number };
export type ListView = { items: ListItem[]; groups: Group[]; progress: { unlocked: number; total: number; pending: number } };

// What the list shows: the achievements still to unlock come first, then
// the ones the person starred higher, then the nearest (or, without a
// position, the catalogue order).
export function listView(
  achievements: Achievement[],
  unlocks: Unlock[],
  here: LngLat | null,
  categories: Category[] = [],
  stars: Record<string, number> = {},
): ListView {
  const byId = new Map(unlocks.map((u) => [u.achievementId, u]));
  const items: ListItem[] = achievements.map((achievement) => {
    const u = byId.get(achievement.id);
    return {
      achievement,
      unlocked: !!u,
      unlockedAt: u?.unlockedAt ?? null,
      meters: here ? distanceMeters(here, achievement.lngLat) : null,
      stars: stars[achievement.id] ?? DEFAULT_STARS,
    };
  });
  // Array.prototype.sort is stable, so equal items keep the catalogue order.
  items.sort((x, y) => Number(x.unlocked) - Number(y.unlocked) || y.stars - x.stars || (here ? x.meters! - y.meters! : 0));
  const mine = achievements.filter((a) => byId.has(a.id)).map((a) => byId.get(a.id)!);
  const groups = categories.map(({ id, label }) => {
    const inGroup = items.filter((i) => i.achievement.category === id);
    return { category: id, label, items: inGroup, unlocked: inGroup.filter((i) => i.unlocked).length, total: inGroup.length };
  }).filter((g) => g.total > 0);
  return {
    items,
    groups,
    progress: { unlocked: mine.length, total: achievements.length, pending: mine.filter((u) => !u.synced).length },
  };
}

export function formatDistance(m: number | null): string {
  if (m === null) return "";
  return m < 1000 ? `${Math.round(m)} m` : `${(m / 1000).toFixed(1)} km`;
}

// Commons fills the author field with a sentence for machines when it has
// no structured author. The photo page still names the author, and the
// list links to it.
export function creditText(image: Image): string {
  const credit = image.credit.trim();
  const who = !credit ? "作者不明" : /^No machine-readable author/.test(credit) ? "作者はリンク先" : credit;
  return `写真: ${who} / ${image.license}`;
}

import { CATEGORIES, CATEGORY_LABEL, type Achievement, type Category, type Image } from "../shared/catalogue";
import { distanceMeters, type LngLat } from "../shared/geo";
import type { Unlock } from "./store";

export type ListItem = { achievement: Achievement; unlocked: boolean; unlockedAt: string | null; meters: number | null };
export type Group = { category: Category; label: string; items: ListItem[]; unlocked: number; total: number };
export type ListView = { items: ListItem[]; groups: Group[]; progress: { unlocked: number; total: number; pending: number } };

// What the list shows: the achievements still to unlock come first, and
// when we know where the person is, the nearest of those come first.
export function listView(achievements: Achievement[], unlocks: Unlock[], here: LngLat | null): ListView {
  const byId = new Map(unlocks.map((u) => [u.achievementId, u]));
  const items: ListItem[] = achievements.map((achievement) => {
    const u = byId.get(achievement.id);
    return {
      achievement,
      unlocked: !!u,
      unlockedAt: u?.unlockedAt ?? null,
      meters: here ? distanceMeters(here, achievement.lngLat) : null,
    };
  });
  if (here) items.sort((x, y) => Number(x.unlocked) - Number(y.unlocked) || x.meters! - y.meters!);
  const mine = achievements.filter((a) => byId.has(a.id)).map((a) => byId.get(a.id)!);
  const groups = CATEGORIES.map((category) => {
    const inGroup = items.filter((i) => i.achievement.category === category);
    return { category, label: CATEGORY_LABEL[category], items: inGroup, unlocked: inGroup.filter((i) => i.unlocked).length, total: inGroup.length };
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

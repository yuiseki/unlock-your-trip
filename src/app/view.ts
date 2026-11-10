import type { Achievement } from "../shared/catalogue";
import { distanceMeters, type LngLat } from "../shared/geo";
import type { Unlock } from "./store";

export type ListItem = { achievement: Achievement; unlocked: boolean; unlockedAt: string | null; meters: number | null };
export type ListView = { items: ListItem[]; progress: { unlocked: number; total: number; pending: number } };

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
  return {
    items,
    progress: { unlocked: mine.length, total: achievements.length, pending: mine.filter((u) => !u.synced).length },
  };
}

export function formatDistance(m: number | null): string {
  if (m === null) return "";
  return m < 1000 ? `${Math.round(m)} m` : `${(m / 1000).toFixed(1)} km`;
}

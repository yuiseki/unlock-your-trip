import type { Achievement, Category, Image } from "../shared/catalogue";
import { distanceMeters, type LngLat } from "../shared/geo";
import { DEFAULT_STARS } from "./prefs";
import type { Unlock } from "./store";

export type ListItem = { achievement: Achievement; unlocked: boolean; unlockedAt: string | null; meters: number | null; stars: number };
export type Group = { category: string; label: string; items: ListItem[]; unlocked: number; total: number };
export type ListView = { items: ListItem[]; groups: Group[]; progress: { unlocked: number; total: number; pending: number } };

// lookingBack: a trip that is over. What was done matters then, so the
// unlocked achievements come first in the order they were unlocked, and the
// rest is shown only on request.
export type ListOptions = { lookingBack?: boolean; showLocked?: boolean };

// What the list shows during a trip: the achievements still to unlock come
// first, then the ones the person starred higher, then the nearest (or,
// without a position, the catalogue order).
export function listView(
  achievements: Achievement[],
  unlocks: Unlock[],
  here: LngLat | null,
  categories: Category[] = [],
  stars: Record<string, number> = {},
  { lookingBack = false, showLocked = true }: ListOptions = {},
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
  const byStarsThenNear = (x: ListItem, y: ListItem) => y.stars - x.stars || (here ? x.meters! - y.meters! : 0);
  if (lookingBack)
    items.sort((x, y) => Number(y.unlocked) - Number(x.unlocked) || (x.unlocked ? x.unlockedAt!.localeCompare(y.unlockedAt!) : byStarsThenNear(x, y)));
  else items.sort((x, y) => Number(x.unlocked) - Number(y.unlocked) || byStarsThenNear(x, y));
  const shown = (i: ListItem) => !lookingBack || showLocked || i.unlocked;
  const mine = achievements.filter((a) => byId.has(a.id)).map((a) => byId.get(a.id)!);
  const groups = categories.map(({ id, label }) => {
    const inGroup = items.filter((i) => i.achievement.category === id);
    return { category: id, label, items: inGroup.filter(shown), unlocked: inGroup.filter((i) => i.unlocked).length, total: inGroup.length };
  }).filter((g) => g.items.length > 0);
  return {
    items,
    groups,
    progress: { unlocked: mine.length, total: achievements.length, pending: mine.filter((u) => !u.synced).length },
  };
}

// 「解除済みの実績のみ表示」 on a past trip. Without a record (a visitor not
// signed in on someone's own pages) there is nothing unlocked to narrow to,
// so it stays off and cannot be ticked. stored: this device's last choice.
export function unlockedOnlyControl(o: { lookingBack: boolean; hasRecord: boolean; stored: boolean | null; planned?: boolean }) {
  if (!o.lookingBack) return { shown: false, enabled: false, checked: false };
  if (!o.hasRecord) return { shown: true, enabled: false, checked: false };
  return { shown: true, enabled: true, checked: o.stored ?? !o.planned };
}

// The achievements the list and the map show, under the same options.
export function shownAchievements(achievements: Achievement[], unlocks: Unlock[], { lookingBack = false, showLocked = true }: ListOptions): Achievement[] {
  if (!lookingBack || showLocked) return achievements;
  const done = new Set(unlocks.map((u) => u.achievementId));
  return achievements.filter((a) => done.has(a.id));
}

// The links at the start of the title. The title itself always leads to the
// top page; a public page adds its person, whose list of trips it belongs to.
export function crumbs(publicUser: string | null): { label: string; href: string }[] {
  const top = { label: "旅の実績解除！", href: "/" };
  return publicUser ? [top, { label: `${publicUser} さん`, href: `/u/${publicUser}/` }] : [top];
}

// The line under the title, the same shape on every page: whose, what, how many.
export type HeaderFacts = { whose: string | null } & ({ trips: number } | { unlocked: number; total: number; pending: number });
export function headerLine(f: HeaderFacts): string {
  const whose = f.whose ? `${f.whose} さんの${"trips" in f ? "旅" : "記録"} ・ ` : "";
  if ("trips" in f) return f.whose ? `${whose}${f.trips} 件` : `旅 ${f.trips} 件`;
  return `${whose}${f.unlocked} / ${f.total} 解除${f.pending ? ` (未送信 ${f.pending})` : ""}`;
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

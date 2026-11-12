// A writer's own photos of an achievement, kept on Gyazo. Gyazo serves a
// resized copy at a URL built from the image ID, so nothing but the ID is
// stored, and the list loads a few kilobytes per photo, not megabytes.
export type Photo = { achievementId: string; gyazoId: string; takenAt: string };

export const gyazoImage = (id: string, size: number) => `https://i.gyazo.com/thumb/${size}/${id}-jpg.jpg`;
export const gyazoPage = (id: string) => `https://gyazo.com/${id}`;

export function photosByAchievement(photos: Photo[]): Map<string, string[]> {
  const m = new Map<string, string[]>();
  for (const p of photos) m.set(p.achievementId, [...(m.get(p.achievementId) ?? []), p.gyazoId]);
  return m;
}

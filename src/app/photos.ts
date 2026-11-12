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

type PointFeature = { geometry: { coordinates: number[] }; properties: { id: string; title: string; unlocked: boolean } };
export type PhotoMarker = { id: string; title: string; unlocked: boolean; lngLat: [number, number]; photo: string; count: number };

// The achievements the map shows as the person's own photo, the way a Gyazo
// collection map does; the rest stay dots. Only shown achievements count.
export function photoMarkers(features: PointFeature[], photos: Map<string, string[]>): PhotoMarker[] {
  return features.flatMap((f) => {
    const own = photos.get(f.properties.id);
    if (!own?.length) return [];
    const [lng, lat] = f.geometry.coordinates;
    return [{ id: f.properties.id, title: f.properties.title, unlocked: f.properties.unlocked, lngLat: [lng, lat] as [number, number], photo: own[0], count: own.length }];
  });
}

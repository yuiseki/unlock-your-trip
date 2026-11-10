export type LngLat = [number, number];

const EARTH_RADIUS_M = 6_371_008.8;
const rad = (d: number) => (d * Math.PI) / 180;

// Haversine distance. Good to well under 0.5% at city scale, which is all
// "how far is this from me" needs.
export function distanceMeters(a: LngLat, b: LngLat): number {
  const dLat = rad(b[1] - a[1]);
  const dLng = rad(b[0] - a[0]);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a[1])) * Math.cos(rad(b[1])) * Math.sin(dLng / 2) ** 2;
  return 2 * EARTH_RADIUS_M * Math.asin(Math.min(1, Math.sqrt(h)));
}

export function sortByDistance<T extends { lngLat: LngLat }>(items: T[], here: LngLat) {
  return items
    .map((item) => ({ item, meters: distanceMeters(here, item.lngLat) }))
    .sort((x, y) => x.meters - y.meters);
}

// [west, south, east, north] around the points and, if known, the current
// position, so the first view of the map shows both where you are and what
// is left to unlock.
export function boundsOf(points: LngLat[], here: LngLat | null): [number, number, number, number] | null {
  const all = here ? [...points, here] : points;
  if (!all.length) return null;
  const lngs = all.map((p) => p[0]);
  const lats = all.map((p) => p[1]);
  return [Math.min(...lngs), Math.min(...lats), Math.max(...lngs), Math.max(...lats)];
}

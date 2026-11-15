// Which trips exist and where each lives in the URL: country, area,
// prefecture (/japan/kansai/osaka/), so another trip is another path rather
// than another site. A person's public record is under /u/<id>/. The build
// (scripts/build-catalogue.ts) takes each region's name and bounds from here.
export type Region = {
  id: string; // the catalogue's file name; achievement ids of new regions start with it
  path: string[];
  name: string;
  year: number; // the trip the list was first made for
  end: string; // the last day of that trip (YYYY-MM-DD, Japan time); after it, the list looks back
  bbox: [number, number, number, number]; // west, south, east, north
  // A trip still being planned: others see only this writer's unlocked items.
  privateTo?: string;
};

export const REGIONS: Region[] = [
  { id: "osaka", path: ["japan", "kansai", "osaka"], name: "大阪", year: 2026, end: "2026-11-14", privateTo: "yuiseki", bbox: [135.35, 34.55, 135.65, 34.78] },
  { id: "hiroshima", path: ["japan", "chugoku", "hiroshima"], name: "広島", year: 2026, end: "2026-09-03", bbox: [132.2, 34.2, 132.6, 34.55] },
  { id: "nagasaki", path: ["japan", "kyushu", "nagasaki"], name: "長崎", year: 2025, end: "2025-03-16", bbox: [129.6, 32.5, 130.05, 33.0] },
  { id: "kobe", path: ["japan", "kansai", "hyogo"], name: "神戸", year: 2024, end: "2024-03-16", bbox: [134.95, 34.55, 135.35, 34.9] },
  { id: "okinawa", path: ["japan", "kyushu", "okinawa"], name: "沖縄", year: 2023, end: "2023-03-17", bbox: [127.6, 26.05, 128.35, 26.95] },
  { id: "kosovo", path: ["kosovo", "prizren", "prizren"], name: "コソボ", year: 2023, end: "2023-07-04", bbox: [20.0, 41.85, 21.8, 43.3] },
];

// Dates are compared in Japan time, the way the trips' ends are written.
export const isPast = (r: Region, now = new Date()) =>
  new Date(now.getTime() + 9 * 3600_000).toISOString().slice(0, 10) > r.end;

export const visibleTo = (r: Region, viewer: string | null) => !r.privateTo || r.privateTo === viewer;

export const regionPath = (r: Region) => `/${r.path.join("/")}/`;
export const regionById = (id: string) => REGIONS.find((r) => r.id === id);

export type Route =
  | { kind: "trips"; publicUser: string | null }
  | { kind: "region"; region: string; publicUser: string | null }
  | { kind: "unknown" };

const USER = /^[a-z0-9-]{1,40}$/;

export function route(pathname: string): Route {
  const parts = pathname.split("/").filter(Boolean);
  let publicUser: string | null = null;
  if (parts[0] === "u") {
    if (!parts[1] || !USER.test(parts[1])) return { kind: "unknown" };
    publicUser = parts[1];
    parts.splice(0, 2);
  }
  // "/" and "/u/<id>/" list the trips.
  if (parts.length === 0) return { kind: "trips", publicUser };
  const region = REGIONS.find((r) => r.path.join("/") === parts.join("/"));
  return region ? { kind: "region", region: region.id, publicUser } : { kind: "unknown" };
}

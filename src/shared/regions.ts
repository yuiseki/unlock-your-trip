// Which regions exist and where each lives in the URL: country, area,
// place (/japan/kansai/osaka/), so another city is another path rather than
// another site. A person's public record of a region is under /u/<id>/.
export type Region = { id: string; path: [string, string, string] };

export const REGIONS: Region[] = [{ id: "osaka", path: ["japan", "kansai", "osaka"] }];
export const DEFAULT_REGION = REGIONS[0];

export const regionPath = (r: Region) => `/${r.path.join("/")}/`;

export type Route =
  | { kind: "region"; region: string; publicUser: string | null }
  | { kind: "redirect"; to: string }
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
  // Addresses from before regions had paths: "/" and "/u/<id>".
  if (parts.length === 0) return { kind: "redirect", to: `${publicUser ? `/u/${publicUser}` : ""}${regionPath(DEFAULT_REGION)}` };
  const region = REGIONS.find((r) => r.path.join("/") === parts.join("/"));
  return region ? { kind: "region", region: region.id, publicUser } : { kind: "unknown" };
}

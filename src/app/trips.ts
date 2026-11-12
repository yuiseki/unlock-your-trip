// The top page: one line per trip, with how much of it is unlocked.
import { regionPath, type Region } from "../shared/regions";

export type TripSummary = { id: string; name: string; year: number; href: string; total: number | null; unlocked: number };

// achievementIds returns null when that trip's list could not be loaded
// (offline before it was ever opened); the trip is listed all the same.
export function tripSummaries(
  regions: Region[],
  achievementIds: (region: string) => string[] | null,
  unlocked: Set<string>,
  publicUser: string | null,
): TripSummary[] {
  return regions
    .map((r, i) => {
      const ids = achievementIds(r.id);
      return {
        order: i,
        summary: {
          id: r.id,
          name: r.name,
          year: r.year,
          href: `${publicUser ? `/u/${publicUser}` : ""}${regionPath(r)}`,
          total: ids ? ids.length : null,
          unlocked: ids ? ids.filter((id) => unlocked.has(id)).length : 0,
        },
      };
    })
    .sort((a, b) => b.summary.year - a.summary.year || a.order - b.order)
    .map((x) => x.summary);
}

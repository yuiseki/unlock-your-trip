import { describe, expect, it } from "vitest";
import { listView } from "./view";
import type { Achievement } from "../shared/catalogue";

const a = (id: string, lngLat: [number, number]): Achievement => ({ id, title: id, kind: "visit", place: id, lngLat });
const achievements = [a("far", [135.5262, 34.6873]), a("near", [135.5017, 34.6689]), a("mid", [135.5061, 34.6522])];
const here: [number, number] = [135.5014, 34.6687];

describe("listView", () => {
  it("keeps catalogue order and has no distance when the location is unknown", () => {
    const v = listView(achievements, [], null);
    expect(v.items.map((i) => i.achievement.id)).toEqual(["far", "near", "mid"]);
    expect(v.items[0].meters).toBeNull();
  });

  it("puts locked achievements first, nearest first, when the location is known", () => {
    const v = listView(achievements, [{ achievementId: "near", unlockedAt: "2026-11-13T03:00:00.000Z", synced: true }], here);
    expect(v.items.map((i) => [i.achievement.id, i.unlocked])).toEqual([
      ["mid", false],
      ["far", false],
      ["near", true],
    ]);
  });

  it("counts progress and pending sends", () => {
    const v = listView(
      achievements,
      [
        { achievementId: "near", unlockedAt: "2026-11-13T03:00:00.000Z", synced: true },
        { achievementId: "mid", unlockedAt: "2026-11-13T04:00:00.000Z", synced: false },
      ],
      null,
    );
    expect(v.progress).toEqual({ unlocked: 2, total: 3, pending: 1 });
  });

  it("ignores unlocks of achievements that are not in this catalogue", () => {
    const v = listView(achievements, [{ achievementId: "kyoto-tower", unlockedAt: "2026-11-13T03:00:00.000Z", synced: true }], null);
    expect(v.progress.unlocked).toBe(0);
  });
});

describe("formatDistance", () => {
  it("shows metres under 1 km and kilometres above", async () => {
    const { formatDistance } = await import("./view");
    expect(formatDistance(340)).toBe("340 m");
    expect(formatDistance(1234)).toBe("1.2 km");
    expect(formatDistance(null)).toBe("");
  });
});

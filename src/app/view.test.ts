import { describe, expect, it } from "vitest";
import { crumbs, headerLine, listView, shownAchievements, unlockedOnlyControl } from "./view";
import type { Achievement } from "../shared/catalogue";

const a = (id: string, lngLat: [number, number], category = "sightseeing"): Achievement => ({ id, title: id, kind: "visit", category, place: id, lngLat });
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

const CATS = [
  { id: "modern-history", label: "近代史" },
  { id: "food", label: "食い倒れ" },
  { id: "sightseeing", label: "観光" },
];

describe("listView groups", () => {
  const mixed = [a("castle", [135.5262, 34.6873]), a("takoyaki", [135.5017, 34.6689], "food"), a("museum", [135.5057, 34.6556], "modern-history"), a("shop", [135.5014, 34.6720])];

  it("groups by category in a fixed order and skips empty categories", () => {
    const v = listView(mixed.filter((x) => x.category !== "modern-history"), [], null, CATS);
    expect(v.groups.map((g) => g.category)).toEqual(["food", "sightseeing"]);
    expect(v.groups[0].label).toBe("食い倒れ");
  });

  it("keeps the nearest-first order inside each group and counts each group", () => {
    const v = listView(mixed, [{ achievementId: "castle", unlockedAt: "2026-11-13T03:00:00.000Z", synced: true }], here, CATS);
    expect(v.groups.map((g) => [g.label, g.items.map((i) => i.achievement.id), g.unlocked, g.total])).toEqual([
      ["近代史", ["museum"], 0, 1],
      ["食い倒れ", ["takoyaki"], 0, 1],
      ["観光", ["shop", "castle"], 1, 2],
    ]);
  });
});

describe("listView stars", () => {
  const cats = [{ id: "sightseeing", label: "観光" }];
  const three = [a("far", [135.5262, 34.6873]), a("near", [135.5017, 34.6689]), a("mid", [135.5061, 34.6522])];

  it("orders by stars inside a group, nearest first among equal stars, unlocked last", () => {
    const stars = { far: 5, mid: 5, near: 1 };
    const v = listView(three, [], here, cats, stars);
    expect(v.groups[0].items.map((i) => [i.achievement.id, i.stars])).toEqual([
      ["mid", 5],
      ["far", 5],
      ["near", 1],
    ]);
    const done = listView(three, [{ achievementId: "mid", unlockedAt: "2026-11-13T03:00:00.000Z", synced: true }], here, cats, stars);
    expect(done.groups[0].items.map((i) => i.achievement.id)).toEqual(["far", "near", "mid"]);
  });

  it("orders by stars and then catalogue order when the location is unknown", () => {
    const v = listView(three, [], null, cats, { mid: 4 });
    expect(v.groups[0].items.map((i) => [i.achievement.id, i.stars])).toEqual([
      ["mid", 4],
      ["far", 3],
      ["near", 3],
    ]);
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

describe("creditText", () => {
  it("shows the author and licence", async () => {
    const { creditText } = await import("./view");
    expect(creditText({ url: "", page: "p", credit: "Takesi0705", license: "CC BY-SA 4.0" })).toBe("写真: Takesi0705 / CC BY-SA 4.0");
  });
  it("points to the photo page when Commons has no machine-readable author", async () => {
    const { creditText } = await import("./view");
    const credit = "No machine-readable author provided. Someone assumed (based on copyright claims).";
    expect(creditText({ url: "", page: "p", credit, license: "CC BY-SA 3.0" })).toBe("写真: 作者はリンク先 / CC BY-SA 3.0");
  });
  it("says so when a public-domain photo has no author", async () => {
    const { creditText } = await import("./view");
    expect(creditText({ url: "", page: "p", credit: "", license: "Public domain" })).toBe("写真: 作者不明 / Public domain");
  });
});

describe("listView looking back at a past trip", () => {
  const u = (achievementId: string, unlockedAt: string) => ({ achievementId, unlockedAt, synced: true });
  const done = [u("mid", "2026-11-13T05:00:00.000Z"), u("far", "2026-11-13T03:00:00.000Z")];

  it("shows only the unlocked achievements, in the order they were unlocked", () => {
    const v = listView(achievements, done, here, [{ id: "sightseeing", label: "観光" }], {}, { lookingBack: true, showLocked: false });
    expect(v.groups[0].items.map((i) => i.achievement.id)).toEqual(["far", "mid"]);
    expect(v.groups[0]).toMatchObject({ unlocked: 2, total: 3 });
  });

  it("shows the rest below them when asked", () => {
    const v = listView(achievements, done, here, [{ id: "sightseeing", label: "観光" }], {}, { lookingBack: true, showLocked: true });
    expect(v.groups[0].items.map((i) => [i.achievement.id, i.unlocked])).toEqual([
      ["far", true],
      ["mid", true],
      ["near", false],
    ]);
  });

  it("leaves out a category with nothing unlocked unless the rest is shown", () => {
    const cats = [{ id: "sightseeing", label: "観光" }, { id: "food", label: "食" }];
    const list = [...achievements, a("soba", [135.5, 34.67], "food")];
    expect(listView(list, done, null, cats, {}, { lookingBack: true, showLocked: false }).groups.map((g) => g.category)).toEqual(["sightseeing"]);
    expect(listView(list, done, null, cats, {}, { lookingBack: true, showLocked: true }).groups.map((g) => g.category)).toEqual(["sightseeing", "food"]);
  });
});

describe("shownAchievements", () => {
  const done = [{ achievementId: "mid", unlockedAt: "2026-11-13T05:00:00.000Z", synced: true }];
  it("gives the map the same achievements as the list", () => {
    expect(shownAchievements(achievements, done, { lookingBack: true, showLocked: false }).map((a) => a.id)).toEqual(["mid"]);
    expect(shownAchievements(achievements, done, { lookingBack: true, showLocked: true })).toHaveLength(3);
    expect(shownAchievements(achievements, done, {})).toHaveLength(3);
  });
});

describe("headerLine", () => {
  it("says whose, what and how many, in that order, on every page", () => {
    expect(headerLine({ whose: null, trips: 6 })).toBe("旅 6 件");
    expect(headerLine({ whose: "yuiseki", trips: 6 })).toBe("yuiseki さんの旅 ・ 6 件");
    expect(headerLine({ whose: null, unlocked: 40, total: 54, pending: 0 })).toBe("40 / 54 解除");
    expect(headerLine({ whose: null, unlocked: 40, total: 54, pending: 2 })).toBe("40 / 54 解除 (未送信 2)");
    expect(headerLine({ whose: "yuiseki", unlocked: 40, total: 54, pending: 0 })).toBe("yuiseki さんの記録 ・ 40 / 54 解除");
  });
});

describe("crumbs", () => {
  it("always leads the title to the top page", () => {
    expect(crumbs(null)).toEqual([{ label: "旅の実績解除！", href: "/" }]);
  });

  it("puts the person between the title and the trip on public pages", () => {
    expect(crumbs("yuiseki")).toEqual([
      { label: "旅の実績解除！", href: "/" },
      { label: "yuiseki さん", href: "/u/yuiseki/" },
    ]);
  });
});

describe("unlockedOnlyControl", () => {
  it("shows all goals by default for a planned trip, while respecting a saved choice", () => {
    expect(unlockedOnlyControl({ lookingBack: true, hasRecord: true, stored: null, planned: true }).checked).toBe(false);
    expect(unlockedOnlyControl({ lookingBack: true, hasRecord: true, stored: true, planned: true }).checked).toBe(true);
  });
  it("is shown only when looking back at a past trip", () => {
    expect(unlockedOnlyControl({ lookingBack: false, hasRecord: true, stored: null })).toEqual({ shown: false, enabled: false, checked: false });
  });

  it("starts ticked for someone with a record, and keeps their choice", () => {
    expect(unlockedOnlyControl({ lookingBack: true, hasRecord: true, stored: null })).toEqual({ shown: true, enabled: true, checked: true });
    expect(unlockedOnlyControl({ lookingBack: true, hasRecord: true, stored: false })).toEqual({ shown: true, enabled: true, checked: false });
  });

  it("is off and cannot be ticked without a record, so the list is not empty", () => {
    expect(unlockedOnlyControl({ lookingBack: true, hasRecord: false, stored: true })).toEqual({ shown: true, enabled: false, checked: false });
  });
});

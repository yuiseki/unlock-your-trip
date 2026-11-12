import { describe, expect, it } from "vitest";
import { applyStarSync, loadPrefs, pendingStars, savePrefs, setStars, starsOf, toggleCollapsed, DEFAULT_STARS, type Prefs } from "./prefs";

const EMPTY = (): Prefs => ({ stars: {}, collapsed: [], starTimes: {}, starPending: [] });

class MemoryStorage {
  data = new Map<string, string>();
  getItem(k: string) { return this.data.get(k) ?? null; }
  setItem(k: string, v: string) { this.data.set(k, v); }
}

describe("starsOf", () => {
  it("gives an achievement without a rating the default stars", () => {
    expect(starsOf({ ...EMPTY(), stars: { tekijuku: 5 } }, "tekijuku")).toBe(5);
    expect(starsOf(EMPTY(), "tekijuku")).toBe(DEFAULT_STARS);
  });
});

describe("setStars and toggleCollapsed", () => {
  it("clamps stars to 1-5 without touching the input", () => {
    const prefs = EMPTY();
    expect(setStars(prefs, "tekijuku", 7).stars.tekijuku).toBe(5);
    expect(setStars(prefs, "tekijuku", 0).stars.tekijuku).toBe(1);
    expect(prefs.stars).toEqual({});
  });

  it("collapses and expands a category", () => {
    const a = toggleCollapsed(EMPTY(), "suito");
    expect(a.collapsed).toEqual(["suito"]);
    expect(toggleCollapsed(a, "suito").collapsed).toEqual([]);
  });
});

describe("loadPrefs and savePrefs", () => {
  it("round-trips per region", () => {
    const s = new MemoryStorage();
    const p: Prefs = { stars: { suito: 4 }, collapsed: ["sightseeing"], starTimes: { suito: "2026-11-12T01:00:00.000Z" }, starPending: ["suito"] };
    savePrefs(s, "osaka", p);
    expect(loadPrefs(s, "osaka")).toEqual(p);
    expect(loadPrefs(s, "hiroshima")).toEqual(EMPTY());
  });

  it("falls back to empty prefs on broken or foreign data", () => {
    const s = new MemoryStorage();
    s.setItem("prefs:osaka", "{not json");
    expect(loadPrefs(s, "osaka")).toEqual(EMPTY());
    s.setItem("prefs:osaka", JSON.stringify({ stars: { suito: "lots" }, collapsed: "x" }));
    expect(loadPrefs(s, "osaka")).toEqual(EMPTY());
  });

  it("does not throw when storage is unavailable", () => {
    const broken = { getItem: () => { throw new Error("blocked"); }, setItem: () => { throw new Error("blocked"); } };
    expect(loadPrefs(broken, "osaka")).toEqual(EMPTY());
    expect(() => savePrefs(broken, "osaka", EMPTY())).not.toThrow();
  });
});

describe("syncing stars between devices", () => {
  const T1 = "2026-11-12T01:00:00.000Z";
  const T2 = "2026-11-12T02:00:00.000Z";

  it("records when each rating changed and that it is not sent yet", () => {
    const p = setStars(EMPTY(), "tekijuku", 5, T1);
    expect(p.starTimes.tekijuku).toBe(T1);
    expect(pendingStars(p)).toEqual([{ achievementId: "tekijuku", stars: 5, updatedAt: T1 }]);
    expect(setStars(p, "tekijuku", 4, T2).starPending).toEqual(["tekijuku"]);
  });

  it("takes in another device's newer rating and keeps its own newer one", () => {
    let p = setStars(EMPTY(), "suito", 2, T1);
    p = setStars(p, "tekijuku", 5, T2);
    p = { ...p, starPending: [] };
    const next = applyStarSync(p, [], [
      { achievementId: "suito", stars: 4, updatedAt: T2 },
      { achievementId: "tekijuku", stars: 1, updatedAt: T1 },
      { achievementId: "abeno-harukas", stars: 5, updatedAt: T1 },
    ]);
    expect(next.stars).toEqual({ suito: 4, tekijuku: 5, "abeno-harukas": 5 });
    expect(next.starTimes.suito).toBe(T2);
  });

  it("clears what was sent, unless it changed again while sending", () => {
    let p = setStars(EMPTY(), "suito", 2, T1);
    p = setStars(p, "tekijuku", 5, T1);
    const sent = pendingStars(p);
    p = setStars(p, "tekijuku", 3, T2); // changed during the request
    const next = applyStarSync(p, sent, sent);
    expect(next.starPending).toEqual(["tekijuku"]);
    expect(next.stars.tekijuku).toBe(3);
  });

  it("keeps a rating that is still waiting to be sent over an older remote one", () => {
    const p = setStars(EMPTY(), "suito", 5, T2);
    const next = applyStarSync(p, [], [{ achievementId: "suito", stars: 1, updatedAt: T1 }]);
    expect(next.stars.suito).toBe(5);
    expect(next.starPending).toEqual(["suito"]);
  });

  it("treats ratings saved before syncing existed as old and unsent", () => {
    const s = new MemoryStorage();
    s.setItem("prefs:osaka", JSON.stringify({ stars: { suito: 4 }, collapsed: [] }));
    const p = loadPrefs(s, "osaka");
    expect(pendingStars(p)).toEqual([{ achievementId: "suito", stars: 4, updatedAt: "1970-01-01T00:00:00.000Z" }]);
  });
});

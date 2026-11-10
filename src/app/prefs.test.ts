import { describe, expect, it } from "vitest";
import { loadPrefs, savePrefs, setStars, starsOf, toggleCollapsed, DEFAULT_STARS } from "./prefs";

class MemoryStorage {
  data = new Map<string, string>();
  getItem(k: string) { return this.data.get(k) ?? null; }
  setItem(k: string, v: string) { this.data.set(k, v); }
}

describe("starsOf", () => {
  it("gives an achievement without a rating the default stars", () => {
    expect(starsOf({ stars: { tekijuku: 5 }, collapsed: [] }, "tekijuku")).toBe(5);
    expect(starsOf({ stars: {}, collapsed: [] }, "tekijuku")).toBe(DEFAULT_STARS);
  });
});

describe("setStars and toggleCollapsed", () => {
  it("clamps stars to 1-5 without touching the input", () => {
    const prefs = { stars: {}, collapsed: [] };
    expect(setStars(prefs, "tekijuku", 7).stars.tekijuku).toBe(5);
    expect(setStars(prefs, "tekijuku", 0).stars.tekijuku).toBe(1);
    expect(prefs.stars).toEqual({});
  });

  it("collapses and expands a category", () => {
    const a = toggleCollapsed({ stars: {}, collapsed: [] }, "suito");
    expect(a.collapsed).toEqual(["suito"]);
    expect(toggleCollapsed(a, "suito").collapsed).toEqual([]);
  });
});

describe("loadPrefs and savePrefs", () => {
  it("round-trips per region", () => {
    const s = new MemoryStorage();
    savePrefs(s, "osaka", { stars: { suito: 4 }, collapsed: ["sightseeing"] });
    expect(loadPrefs(s, "osaka")).toEqual({ stars: { suito: 4 }, collapsed: ["sightseeing"] });
    expect(loadPrefs(s, "hiroshima")).toEqual({ stars: {}, collapsed: [] });
  });

  it("falls back to empty prefs on broken or foreign data", () => {
    const s = new MemoryStorage();
    s.setItem("prefs:osaka", "{not json");
    expect(loadPrefs(s, "osaka")).toEqual({ stars: {}, collapsed: [] });
    s.setItem("prefs:osaka", JSON.stringify({ stars: { suito: "lots" }, collapsed: "x" }));
    expect(loadPrefs(s, "osaka")).toEqual({ stars: {}, collapsed: [] });
  });

  it("does not throw when storage is unavailable", () => {
    const broken = { getItem: () => { throw new Error("blocked"); }, setItem: () => { throw new Error("blocked"); } };
    expect(loadPrefs(broken, "osaka")).toEqual({ stars: {}, collapsed: [] });
    expect(() => savePrefs(broken, "osaka", { stars: {}, collapsed: [] })).not.toThrow();
  });
});

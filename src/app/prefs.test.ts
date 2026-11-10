import { describe, expect, it } from "vitest";
import { loadPrefs, orderCategories, savePrefs, setStars, toggleCollapsed, DEFAULT_STARS } from "./prefs";

const cats = [
  { id: "modern-history", label: "近代史" },
  { id: "kuidaore", label: "食い倒れ" },
  { id: "suito", label: "水都" },
  { id: "sightseeing", label: "観光" },
];

class MemoryStorage {
  data = new Map<string, string>();
  getItem(k: string) { return this.data.get(k) ?? null; }
  setItem(k: string, v: string) { this.data.set(k, v); }
}

describe("orderCategories", () => {
  it("keeps the catalogue order when nothing is starred", () => {
    expect(orderCategories(cats, { stars: {}, collapsed: [] }).map((c) => c.id)).toEqual(["modern-history", "kuidaore", "suito", "sightseeing"]);
  });

  it("puts more stars first and keeps the catalogue order among equals", () => {
    const prefs = { stars: { sightseeing: 5, suito: 1, kuidaore: 5 }, collapsed: [] };
    expect(orderCategories(cats, prefs).map((c) => [c.id, c.stars])).toEqual([
      ["kuidaore", 5],
      ["sightseeing", 5],
      ["modern-history", DEFAULT_STARS],
      ["suito", 1],
    ]);
  });
});

describe("setStars and toggleCollapsed", () => {
  it("clamps stars to 1-5 without touching the input", () => {
    const prefs = { stars: {}, collapsed: [] };
    expect(setStars(prefs, "suito", 7).stars.suito).toBe(5);
    expect(setStars(prefs, "suito", 0).stars.suito).toBe(1);
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

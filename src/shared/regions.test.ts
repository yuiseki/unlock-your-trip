import { describe, expect, it } from "vitest";
import { REGIONS, isPast, regionPath, route } from "./regions";

describe("route", () => {
  it("opens a region by its place in the world", () => {
    expect(route("/japan/kansai/osaka/")).toEqual({ kind: "region", region: "osaka", publicUser: null });
    expect(route("/japan/kansai/osaka")).toEqual({ kind: "region", region: "osaka", publicUser: null });
  });

  it("opens someone's public record of a region", () => {
    expect(route("/u/yuiseki/japan/kansai/osaka/")).toEqual({ kind: "region", region: "osaka", publicUser: "yuiseki" });
  });

  it("lists the trips at the top, and someone's trips under /u/<id>/", () => {
    expect(route("/")).toEqual({ kind: "trips", publicUser: null });
    expect(route("/u/yuiseki")).toEqual({ kind: "trips", publicUser: "yuiseki" });
    expect(route("/u/yuiseki/")).toEqual({ kind: "trips", publicUser: "yuiseki" });
  });

  it("opens the other trips by prefecture", () => {
    expect(route("/japan/chugoku/hiroshima/")).toMatchObject({ kind: "region", region: "hiroshima" });
    expect(route("/japan/kansai/hyogo/")).toMatchObject({ kind: "region", region: "kobe" });
    expect(route("/kosovo/prizren/prizren/")).toMatchObject({ kind: "region", region: "kosovo" });
    expect(route("/malaysia/kuala-lumpur/kuala-lumpur/")).toMatchObject({ kind: "region", region: "malaysia" });
  });

  it("says when a region does not exist yet", () => {
    expect(route("/japan/kanto/tokyo/")).toEqual({ kind: "unknown" });
    expect(route("/u/yuiseki/japan/kanto/tokyo/")).toEqual({ kind: "unknown" });
    expect(route("/u/Not_An_Id/japan/kansai/osaka/")).toEqual({ kind: "unknown" });
    expect(route("/japan/")).toEqual({ kind: "unknown" });
  });
});

describe("REGIONS", () => {
  it("registers the September 2026 Kuala Lumpur trip", () => {
    expect(REGIONS.find((r) => r.id === "malaysia")).toMatchObject({ name: "マレーシア", year: 2026, end: "2026-09-22" });
    expect(REGIONS.find((r) => r.id === "malaysia")?.showGoalsByDefault).toBe(true);
  });
  it("gives every region a lower-case path of country, area and prefecture", () => {
    for (const r of REGIONS) expect(regionPath(r)).toMatch(/^\/[a-z-]+\/[a-z-]+\/[a-z-]+\/$/);
    expect(new Set(REGIONS.map(regionPath)).size).toBe(REGIONS.length);
    expect(new Set(REGIONS.map((r) => r.id)).size).toBe(REGIONS.length);
  });
});

// The built catalogues, read the way Vite reads files (no Node types needed).
const built = import.meta.glob("../../public/catalogues/*.json", { eager: true, import: "default" }) as Record<string, { region: string; name: string; achievements: { id: string }[] }>;
const catalogueOf = (id: string) => built[`../../public/catalogues/${id}.json`];

describe("every region", () => {
  it("has a built catalogue that names the same region", () => {
    for (const r of REGIONS) {
      const c = catalogueOf(r.id);
      expect(c, `public/catalogues/${r.id}.json`).toBeDefined();
      expect(c.region).toBe(r.id);
      expect(c.name).toBe(r.name);
    }
  });

  it("has a Natural Earth boundary polygon for every achievement region", () => {
    for (const r of REGIONS) {
      const c = catalogueOf(r.id) as { boundary?: { type?: string; coordinates?: unknown } };
      expect(c.boundary?.type, `${r.id} boundary`).toMatch(/^(Polygon|MultiPolygon)$/);
      expect(c.boundary?.coordinates, `${r.id} boundary coordinates`).toBeDefined();
    }
  });

  // Unlocks and stars are kept per achievement id, not per region, so an id
  // used by two regions would share one unlock. Osaka's ids came first and
  // keep their names; every later region prefixes its own.
  it("uses achievement ids no other region uses", () => {
    const owner = new Map<string, string>();
    for (const r of REGIONS) {
      const c = catalogueOf(r.id);
      if (!c) continue; // the test above names the missing file
      for (const a of c.achievements) {
        expect(owner.get(a.id), `${a.id} is in ${owner.get(a.id)} and ${r.id}`).toBeUndefined();
        owner.set(a.id, r.id);
        if (r.id !== "osaka") expect(a.id.startsWith(`${r.id}-`), a.id).toBe(true);
      }
    }
  });
});

describe("isPast", () => {
  const osaka = REGIONS.find((r) => r.id === "osaka")!;
  it("is a past trip from the day after it ended", () => {
    expect(isPast(osaka, new Date("2026-11-14T23:00:00+09:00"))).toBe(false);
    expect(isPast(osaka, new Date("2026-11-15T00:00:00+09:00"))).toBe(true);
  });
});

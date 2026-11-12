import { describe, expect, it } from "vitest";
import { REGIONS, regionPath, route } from "./regions";

describe("route", () => {
  it("opens a region by its place in the world", () => {
    expect(route("/japan/kansai/osaka/")).toEqual({ kind: "region", region: "osaka", publicUser: null });
    expect(route("/japan/kansai/osaka")).toEqual({ kind: "region", region: "osaka", publicUser: null });
  });

  it("opens someone's public record of a region", () => {
    expect(route("/u/yuiseki/japan/kansai/osaka/")).toEqual({ kind: "region", region: "osaka", publicUser: "yuiseki" });
  });

  it("sends the old addresses to the default region", () => {
    expect(route("/")).toEqual({ kind: "redirect", to: "/japan/kansai/osaka/" });
    expect(route("/u/yuiseki")).toEqual({ kind: "redirect", to: "/u/yuiseki/japan/kansai/osaka/" });
    expect(route("/u/yuiseki/")).toEqual({ kind: "redirect", to: "/u/yuiseki/japan/kansai/osaka/" });
  });

  it("says when a region does not exist yet", () => {
    expect(route("/japan/kanto/tokyo/")).toEqual({ kind: "unknown" });
    expect(route("/u/yuiseki/japan/kanto/tokyo/")).toEqual({ kind: "unknown" });
    expect(route("/u/Not_An_Id/japan/kansai/osaka/")).toEqual({ kind: "unknown" });
    expect(route("/japan/")).toEqual({ kind: "unknown" });
  });
});

describe("REGIONS", () => {
  it("gives every region a lower-case path of country, area and place", () => {
    for (const r of REGIONS) expect(regionPath(r)).toMatch(/^\/[a-z-]+\/[a-z-]+\/[a-z-]+\/$/);
    expect(new Set(REGIONS.map(regionPath)).size).toBe(REGIONS.length);
  });
});

describe("every region", () => {
  it("has a built catalogue that names the same region", async () => {
    const { readFileSync } = await import("node:fs");
    for (const r of REGIONS) {
      const c = JSON.parse(readFileSync(`public/catalogues/${r.id}.json`, "utf8"));
      expect(c.region).toBe(r.id);
    }
  });
});

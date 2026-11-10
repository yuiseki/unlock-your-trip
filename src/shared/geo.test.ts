import { describe, expect, it } from "vitest";
import { distanceMeters, sortByDistance } from "./geo";

describe("distanceMeters", () => {
  it("is zero for the same point", () => {
    expect(distanceMeters([135.5, 34.67], [135.5, 34.67])).toBe(0);
  });
  it("measures Osaka Castle to Tsutenkaku at about 4 km", () => {
    const d = distanceMeters([135.5262, 34.6873], [135.5063, 34.6525]);
    expect(d).toBeGreaterThan(4000);
    expect(d).toBeLessThan(4400);
  });
});

describe("sortByDistance", () => {
  it("orders items nearest first and keeps the distance", () => {
    const here: [number, number] = [135.5014, 34.6687];
    const items = [
      { id: "far", lngLat: [135.5262, 34.6873] as [number, number] },
      { id: "near", lngLat: [135.5017, 34.6689] as [number, number] },
    ];
    const out = sortByDistance(items, here);
    expect(out.map((x) => x.item.id)).toEqual(["near", "far"]);
    expect(out[0].meters).toBeLessThan(100);
  });
});

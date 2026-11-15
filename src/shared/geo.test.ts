import { describe, expect, it } from "vitest";
import { boundsOf, boundsOfGeometry, distanceMeters, sortByDistance } from "./geo";

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

describe("boundsOf", () => {
  it("wraps every point and the current position", async () => {
    const { boundsOf } = await import("./geo");
    const pts: [number, number][] = [[135.50, 34.66], [135.52, 34.69]];
    expect(boundsOf(pts, [135.49, 34.70])).toEqual([135.49, 34.66, 135.52, 34.70]);
  });
  it("wraps the points alone when the position is unknown", async () => {
    const { boundsOf } = await import("./geo");
    expect(boundsOf([[135.50, 34.66], [135.52, 34.69]], null)).toEqual([135.50, 34.66, 135.52, 34.69]);
  });
  it("returns null when there is nothing to wrap", async () => {
    const { boundsOf } = await import("./geo");
    expect(boundsOf([], null)).toBeNull();
  });
});

describe("boundsOfGeometry", () => {
  it("fits every polygon ring and achievement point in the region bounds", () => {
    const polygon = { type: "Polygon" as const, coordinates: [[[101.68, 3.1], [101.7, 3.1], [101.7, 3.15], [101.68, 3.1]]] };
    expect(boundsOfGeometry(polygon, [[101.72, 2.75]])).toEqual([101.68, 2.75, 101.72, 3.15]);
  });

  it("supports MultiPolygon geometry", () => {
    const polygon = { type: "MultiPolygon" as const, coordinates: [[[[20, 42], [21, 42], [21, 43], [20, 42]]], [[[22, 41], [23, 41], [23, 42], [22, 41]]]] };
    expect(boundsOfGeometry(polygon, [])).toEqual([20, 41, 23, 43]);
  });
});

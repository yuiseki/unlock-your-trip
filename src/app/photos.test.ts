import { describe, expect, it } from "vitest";
import { gyazoImage, gyazoPage, photoMarkers, photosByAchievement } from "./photos";

const G = "424b64b813958ed5f0df977de3d6b877";

describe("Gyazo URLs", () => {
  it("asks Gyazo for a small copy instead of the multi-megabyte original", () => {
    expect(gyazoImage(G, 200)).toBe(`https://i.gyazo.com/thumb/200/${G}-jpg.jpg`);
    expect(gyazoPage(G)).toBe(`https://gyazo.com/${G}`);
  });
});

describe("photosByAchievement", () => {
  it("groups the photos by achievement, keeping their order", () => {
    const m = photosByAchievement([
      { achievementId: "okinawa-soba", gyazoId: "1".repeat(32), takenAt: "t1" },
      { achievementId: "okinawa-eisa", gyazoId: "2".repeat(32), takenAt: "t2" },
      { achievementId: "okinawa-soba", gyazoId: "3".repeat(32), takenAt: "t3" },
    ]);
    expect(m.get("okinawa-soba")).toEqual(["1".repeat(32), "3".repeat(32)]);
    expect(m.get("okinawa-eisa")).toEqual(["2".repeat(32)]);
  });
});

describe("photoMarkers", () => {
  const feature = (id: string, unlocked: boolean) => ({
    type: "Feature" as const,
    geometry: { type: "Point" as const, coordinates: [135.5, 34.6] },
    properties: { id, title: `title-${id}`, unlocked },
  });

  it("makes a photo marker for each shown achievement that has photos", () => {
    const photos = new Map([["a", ["1".repeat(32), "2".repeat(32)]], ["gone", ["3".repeat(32)]]]);
    expect(photoMarkers([feature("a", true), feature("b", false)], photos)).toEqual([
      { id: "a", title: "title-a", unlocked: true, lngLat: [135.5, 34.6], photo: "1".repeat(32), count: 2 },
    ]);
  });
});

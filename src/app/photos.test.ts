import { describe, expect, it } from "vitest";
import { gyazoImage, gyazoPage, photosByAchievement } from "./photos";

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

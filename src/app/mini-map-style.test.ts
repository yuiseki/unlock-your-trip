import { describe, expect, it } from "vitest";
import { miniAchievementLayer } from "./mini-map-style";

describe("trip card map", () => {
  it("draws unlocked achievements above locked achievements", () => {
    expect(miniAchievementLayer.layout?.["circle-sort-key"]).toEqual(["case", ["get", "unlocked"], 1, 0]);
  });
});

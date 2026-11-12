import { describe, expect, it } from "vitest";
import type { Region } from "../shared/regions";
import { tripSummaries } from "./trips";

const regions: Region[] = [
  { id: "osaka", path: ["japan", "kansai", "osaka"], name: "大阪", year: 2026, bbox: [0, 0, 1, 1] },
  { id: "okinawa", path: ["japan", "kyushu", "okinawa"], name: "沖縄", year: 2023, bbox: [0, 0, 1, 1] },
  { id: "hiroshima", path: ["japan", "chugoku", "hiroshima"], name: "広島", year: 2026, bbox: [0, 0, 1, 1] },
];
const ids = { osaka: ["osaka-castle", "tsutenkaku"], okinawa: ["okinawa-a", "okinawa-b", "okinawa-c"], hiroshima: ["hiroshima-a"] };

describe("tripSummaries", () => {
  it("counts each trip's achievements and unlocks, newest trips first", () => {
    const list = tripSummaries(regions, (id) => ids[id as keyof typeof ids], new Set(["osaka-castle", "okinawa-b", "okinawa-c"]), null);
    expect(list).toEqual([
      { id: "osaka", name: "大阪", year: 2026, href: "/japan/kansai/osaka/", total: 2, unlocked: 1 },
      { id: "hiroshima", name: "広島", year: 2026, href: "/japan/chugoku/hiroshima/", total: 1, unlocked: 0 },
      { id: "okinawa", name: "沖縄", year: 2023, href: "/japan/kyushu/okinawa/", total: 3, unlocked: 2 },
    ]);
  });

  it("links to someone's public record of each trip", () => {
    const [first] = tripSummaries(regions, (id) => ids[id as keyof typeof ids], new Set(), "yuiseki");
    expect(first.href).toBe("/u/yuiseki/japan/kansai/osaka/");
  });

  it("still lists a trip whose catalogue could not be loaded", () => {
    const list = tripSummaries(regions, (id) => (id === "okinawa" ? null : ids[id as keyof typeof ids]), new Set(), null);
    expect(list.find((t) => t.id === "okinawa")).toMatchObject({ total: null, unlocked: 0 });
  });
});

import { describe, expect, it } from "vitest";
import { japaneseLabels } from "./style";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const style: { version: number; sources: object; layers: any[] } = {
  version: 8,
  sources: {},
  layers: [
    { id: "water", type: "fill" },
    {
      id: "place",
      type: "symbol",
      layout: { "text-field": ["concat", ["get", "name:latin"], "\n", ["get", "name:nonlatin"]], "text-size": 12 },
    },
    { id: "shield", type: "symbol", layout: { "text-field": "{ref}" } },
  ],
};

describe("japaneseLabels", () => {
  it("replaces name-based text fields with Japanese first, then the local name", () => {
    const out = japaneseLabels(style);
    expect(out.layers[1].layout["text-field"]).toEqual(["coalesce", ["get", "name:ja"], ["get", "name"]]);
    expect(out.layers[1].layout["text-size"]).toBe(12);
  });

  it("leaves layers without names alone (road shields, fills)", () => {
    const out = japaneseLabels(style);
    expect(out.layers[0]).toEqual(style.layers[0]);
    expect(out.layers[2].layout["text-field"]).toBe("{ref}");
  });

  it("does not mutate the input", () => {
    const copy = structuredClone(style);
    japaneseLabels(style);
    expect(style).toEqual(copy);
  });
});

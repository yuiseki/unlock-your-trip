import { describe, expect, it } from "vitest";
import { validateCatalogue, type Catalogue } from "./catalogue";

const ok: Catalogue = {
  region: "osaka",
  name: "大阪",
  bbox: [135.3, 34.5, 135.7, 34.8],
  categories: [
    { id: "sightseeing", label: "観光" },
    { id: "kuidaore", label: "食い倒れ" },
  ],
  achievements: [
    {
      id: "osaka-castle",
      title: "大阪城の天守閣に登る",
      kind: "visit",
      category: "sightseeing",
      place: "大阪城",
      lngLat: [135.5259, 34.6873],
      wikidata: "Q194155",
      image: { url: "https://upload.wikimedia.org/x.jpg", page: "https://commons.wikimedia.org/wiki/File:X.jpg", credit: "Someone", license: "CC BY-SA 4.0" },
    },
    { id: "eat-takoyaki", title: "たこ焼きを食べる", kind: "eat", category: "kuidaore", place: "道頓堀", lngLat: [135.5013, 34.6687] },
  ],
};

describe("validateCatalogue", () => {
  it("accepts a well-formed catalogue", () => {
    expect(validateCatalogue(ok)).toEqual([]);
  });

  it("rejects duplicate ids", () => {
    const bad = { ...ok, achievements: [ok.achievements[0], ok.achievements[0]] };
    expect(validateCatalogue(bad)).toContain("duplicate id: osaka-castle");
  });

  it("rejects ids that are not url-safe slugs", () => {
    const bad = { ...ok, achievements: [{ ...ok.achievements[1], id: "Eat Takoyaki" }] };
    expect(validateCatalogue(bad)).toContain("bad id: Eat Takoyaki");
  });

  it("rejects points outside the region", () => {
    const bad = { ...ok, achievements: [{ ...ok.achievements[1], lngLat: [139.7, 35.6] as [number, number] }] };
    expect(validateCatalogue(bad)).toContain("outside region: eat-takoyaki");
  });

  it("rejects a missing title or an unknown kind", () => {
    const bad = { ...ok, achievements: [{ ...ok.achievements[1], title: "", kind: "fly" as never }] };
    const errors = validateCatalogue(bad);
    expect(errors).toContain("missing title: eat-takoyaki");
    expect(errors).toContain("unknown kind: eat-takoyaki");
  });

  it("rejects a category the catalogue does not define", () => {
    const bad = { ...ok, achievements: [{ ...ok.achievements[1], category: "transport" }] };
    expect(validateCatalogue(bad)).toContain("unknown category: eat-takoyaki");
  });

  it("rejects duplicate category ids", () => {
    const bad = { ...ok, categories: [...ok.categories, { id: "kuidaore", label: "食" }] };
    expect(validateCatalogue(bad)).toContain("duplicate category: kuidaore");
  });

  it("rejects an image without credit or licence", () => {
    const img = { url: "https://upload.wikimedia.org/x.jpg", page: "", credit: "", license: "" };
    const bad = { ...ok, achievements: [{ ...ok.achievements[0], image: img }] };
    expect(validateCatalogue(bad)).toContain("image without credit or licence: osaka-castle");
  });

  it("allows a public-domain or CC0 image without an author, but still needs its page", () => {
    for (const license of ["Public domain", "CC0"]) {
      const img = { url: "https://upload.wikimedia.org/x.jpg", page: "https://commons.wikimedia.org/wiki/File:X.jpg", credit: "", license };
      expect(validateCatalogue({ ...ok, achievements: [{ ...ok.achievements[0], image: img }] })).toEqual([]);
    }
    const noPage = { url: "https://upload.wikimedia.org/x.jpg", page: "", credit: "", license: "CC0" };
    expect(validateCatalogue({ ...ok, achievements: [{ ...ok.achievements[0], image: noPage }] })).toContain(
      "image without credit or licence: osaka-castle",
    );
  });
});

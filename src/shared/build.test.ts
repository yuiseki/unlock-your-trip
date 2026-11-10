import { describe, expect, it } from "vitest";
import { buildCatalogue, parseTsv } from "./build";

const seed = "id\ttitle\tkind\tcategory\tplace\tsearch\nosaka-castle\t大阪城天守閣に登る\tvisit\tsightseeing\t大阪城天守閣\t大阪城天守閣\neat-551\t551蓬莱の豚まんを食べる\teat\tfood\t551蓬莱\t551蓬莱\n";
const places = "id\tsource\twikidata\tlng\tlat\timage_file\nosaka-castle\twikidata:Q96338884\tQ96338884\t135.52587\t34.68729\tCastle.jpg\neat-551\tosm:way/219869422\t\t135.50126\t34.66647\t\n";
const images = "file\tthumb_url\tpage_url\tcredit\tlicense\nCastle.jpg\thttps://upload.wikimedia.org/c.jpg\thttps://commons.wikimedia.org/wiki/File:Castle.jpg\tSomeone\tCC BY-SA 4.0\n";
const meta = { region: "osaka", name: "大阪", bbox: [135.35, 34.55, 135.65, 34.78] as [number, number, number, number] };
const categories = "id\tlabel\nsightseeing\t観光\nfood\t食\n";

describe("parseTsv", () => {
  it("reads a header row and keeps empty cells", () => {
    expect(parseTsv("a\tb\n1\t\n")).toEqual([{ a: "1", b: "" }]);
  });
});

describe("buildCatalogue", () => {
  it("joins seed, places and images in seed order", () => {
    const { catalogue, errors } = buildCatalogue(meta, categories, seed, places, images);
    expect(errors).toEqual([]);
    expect(catalogue.achievements.map((a) => a.id)).toEqual(["osaka-castle", "eat-551"]);
    expect(catalogue.achievements[0]).toMatchObject({
      category: "sightseeing",
      lngLat: [135.52587, 34.68729],
      wikidata: "Q96338884",
      source: "wikidata:Q96338884",
      image: { url: "https://upload.wikimedia.org/c.jpg", credit: "Someone", license: "CC BY-SA 4.0" },
    });
    expect(catalogue.achievements[1].image).toBeUndefined();
    expect(catalogue.achievements[1].wikidata).toBeUndefined();
    expect(catalogue.categories).toEqual([
      { id: "sightseeing", label: "観光" },
      { id: "food", label: "食" },
    ]);
  });

  it("reports a seed row with no place instead of dropping it", () => {
    const { errors } = buildCatalogue(meta, categories, seed, places.split("\n").slice(0, 2).join("\n"), images);
    expect(errors).toContain("no place for: eat-551");
  });

  it("reports an image file that has no credit row", () => {
    const { errors } = buildCatalogue(meta, categories, seed, places, "file\tthumb_url\tpage_url\tcredit\tlicense\n");
    expect(errors).toContain("no image row for: Castle.jpg");
  });

  it("passes the result through catalogue validation", () => {
    const far = places.replace("135.50126\t34.66647", "139.7\t35.6");
    expect(buildCatalogue(meta, categories, seed, far, images).errors).toContain("outside region: eat-551");
  });
});

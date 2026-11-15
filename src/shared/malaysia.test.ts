import { describe, expect, it } from "vitest";
import seed from "../../data/malaysia.seed.tsv?raw";
import { parseTsv } from "./build";

describe("Malaysia achievement goals", () => {
  it("includes being caught in Kuala Lumpur traffic even without a photo", () => {
    expect(parseTsv(seed)).toContainEqual(expect.objectContaining({
      id: "malaysia-kl-traffic",
      title: "クアラルンプールで渋滞に巻き込まれる",
      category: "city-life",
    }));
  });
});

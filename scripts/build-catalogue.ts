// Usage: vite-node scripts/build-catalogue.ts osaka
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { buildCatalogue } from "../src/shared/build";
import { regionById } from "../src/shared/regions";

const region = process.argv[2];
const r = regionById(region);
if (!r) throw new Error(`unknown region: ${region}`);
const boundary = JSON.parse(readFileSync(`data/${region}.boundary.geojson`, "utf8"));
const meta = { name: r.name, bbox: r.bbox, boundary };
const read = (kind: string) => readFileSync(`data/${region}.${kind}.tsv`, "utf8");
const { catalogue, errors } = buildCatalogue({ region, ...meta }, read("categories"), read("seed"), read("places"), read("images"));
if (errors.length) {
  console.error(errors.join("\n"));
  process.exit(1);
}
mkdirSync("public/catalogues", { recursive: true });
writeFileSync(`public/catalogues/${region}.json`, JSON.stringify(catalogue, null, 1) + "\n");
console.log(`${region}: ${catalogue.achievements.length} achievements`);

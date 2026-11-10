// Usage: vite-node scripts/build-catalogue.ts osaka
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { buildCatalogue } from "../src/shared/build";

const META: Record<string, { name: string; bbox: [number, number, number, number] }> = {
  osaka: { name: "大阪", bbox: [135.35, 34.55, 135.65, 34.78] },
};
const region = process.argv[2];
const meta = META[region];
if (!meta) throw new Error(`unknown region: ${region}`);
const read = (kind: string) => readFileSync(`data/${region}.${kind}.tsv`, "utf8");
const { catalogue, errors } = buildCatalogue({ region, ...meta }, read("categories"), read("seed"), read("places"), read("images"));
if (errors.length) {
  console.error(errors.join("\n"));
  process.exit(1);
}
mkdirSync("public/catalogues", { recursive: true });
writeFileSync(`public/catalogues/${region}.json`, JSON.stringify(catalogue, null, 1) + "\n");
console.log(`${region}: ${catalogue.achievements.length} achievements`);

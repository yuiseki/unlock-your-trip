// One-off helper: find Wikidata items for the seed names, keep the ones
// inside the region, and print them for a human to check. Not run at build.
import { readFileSync } from "node:fs";
const UA = { "User-Agent": "unlock-your-trip-build/0.1" };
const [W, S, E, N] = [135.35, 34.55, 135.65, 34.78];
const rows = readFileSync(process.argv[2], "utf8").trim().split("\n").slice(1).map((l) => l.split("\t"));
const api = "https://www.wikidata.org/w/api.php?format=json&origin=*&maxlag=5&";
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
async function getJson(url) {
  for (let i = 0; i < 5; i++) {
    await sleep(1500 * (i + 1));
    const r = await fetch(url, { headers: UA });
    const t = await r.text();
    try { return JSON.parse(t); } catch { console.error(`retry ${i + 1}: ${t.slice(0, 60)}`); }
  }
  throw new Error(`gave up: ${url}`);
}
for (const [id, , , , search] of rows) {
  const s = await getJson(api + `action=wbsearchentities&language=ja&uselang=ja&limit=10&search=${encodeURIComponent(search)}`);
  const ids = (s.search ?? []).map((x) => x.id);
  if (!ids.length) { console.log(`${id}\t-\tNO HIT`); continue; }
  const g = await getJson(api + `action=wbgetentities&props=claims|labels|descriptions&languages=ja&ids=${ids.join("|")}`);
  const hits = ids.map((q) => g.entities[q]).map((e) => {
    const c = e.claims?.P625?.[0]?.mainsnak?.datavalue?.value;
    return { q: e.id, label: e.labels?.ja?.value, desc: e.descriptions?.ja?.value ?? "", lng: c?.longitude, lat: c?.latitude, img: e.claims?.P18?.[0]?.mainsnak?.datavalue?.value };
  }).filter((h) => h.lng >= W && h.lng <= E && h.lat >= S && h.lat <= N);
  if (!hits.length) console.log(`${id}\t-\tNONE IN REGION (${ids.join(",")})`);
  for (const h of hits.slice(0, 2)) console.log(`${id}\t${h.q}\t${h.label}\t${h.desc.slice(0, 30)}\t${h.lng.toFixed(5)},${h.lat.toFixed(5)}\t${h.img ? "img" : "-"}`);
}

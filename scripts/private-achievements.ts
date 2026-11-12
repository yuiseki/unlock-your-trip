// Usage: vite-node scripts/private-achievements.ts
// Writes worker/private-achievements.json: the achievement ids of trips that
// are private to their writer, so the Worker can leave them out of public
// reads. Run after the catalogues are built.
import { readFileSync, writeFileSync } from "node:fs";
import { REGIONS } from "../src/shared/regions";

const ids = REGIONS.filter((r) => r.privateTo).flatMap((r) => {
  const c = JSON.parse(readFileSync(`public/catalogues/${r.id}.json`, "utf8")) as { achievements: { id: string }[] };
  return c.achievements.map((a) => a.id);
});
writeFileSync("worker/private-achievements.json", JSON.stringify([...new Set(ids)].sort(), null, 1) + "\n");
console.log(`private achievements: ${ids.length}`);

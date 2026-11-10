import { validateCatalogue, type Achievement, type Catalogue, type Kind } from "./catalogue";

export function parseTsv(text: string): Record<string, string>[] {
  const [head, ...lines] = text.replace(/\r/g, "").split("\n").filter((l) => l.length > 0);
  const keys = head.split("\t");
  return lines.map((l) => {
    const cells = l.split("\t");
    return Object.fromEntries(keys.map((k, i) => [k, cells[i] ?? ""]));
  });
}

type Meta = Omit<Catalogue, "achievements" | "categories">;

// Joins the hand-written seed with the pinned places and image credits.
// Every row that cannot be joined is an error, never a silent omission.
export function buildCatalogue(meta: Meta, categoriesTsv: string, seedTsv: string, placesTsv: string, imagesTsv: string) {
  const errors: string[] = [];
  const places = new Map(parseTsv(placesTsv).map((r) => [r.id, r]));
  const images = new Map(parseTsv(imagesTsv).map((r) => [r.file, r]));
  const achievements: Achievement[] = [];
  for (const s of parseTsv(seedTsv)) {
    const p = places.get(s.id);
    if (!p) {
      errors.push(`no place for: ${s.id}`);
      continue;
    }
    const a: Achievement = {
      id: s.id,
      title: s.title,
      kind: s.kind as Kind,
      category: s.category,
      place: s.place,
      lngLat: [Number(p.lng), Number(p.lat)],
      source: p.source,
    };
    if (p.wikidata) a.wikidata = p.wikidata;
    if (p.image_file) {
      const img = images.get(p.image_file);
      if (!img) errors.push(`no image row for: ${p.image_file}`);
      else a.image = { url: img.thumb_url, page: img.page_url, credit: img.credit, license: img.license };
    }
    achievements.push(a);
  }
  const categories = parseTsv(categoriesTsv).map((r) => ({ id: r.id, label: r.label }));
  const catalogue: Catalogue = { ...meta, categories, achievements };
  errors.push(...validateCatalogue(catalogue));
  return { catalogue, errors };
}

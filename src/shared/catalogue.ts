import type { LngLat } from "./geo";

export const KINDS = ["visit", "eat", "ride", "see", "do"] as const;
export type Kind = (typeof KINDS)[number];

export type Image = {
  url: string; // the file itself
  page: string; // where the credit and licence come from
  credit: string;
  license: string;
};

export type Achievement = {
  id: string;
  title: string;
  kind: Kind;
  place: string;
  lngLat: LngLat;
  wikidata?: string;
  image?: Image;
};

export type Catalogue = {
  region: string;
  name: string;
  bbox: [number, number, number, number]; // west, south, east, north
  achievements: Achievement[];
};

const SLUG = /^[a-z0-9]+(-[a-z0-9]+)*$/;

// Returns every problem found, so a broken catalogue fails loudly at build
// time instead of shipping a list with silent holes.
export function validateCatalogue(c: Catalogue): string[] {
  const errors: string[] = [];
  const seen = new Set<string>();
  const [w, s, e, n] = c.bbox;
  for (const a of c.achievements) {
    if (seen.has(a.id)) errors.push(`duplicate id: ${a.id}`);
    seen.add(a.id);
    if (!SLUG.test(a.id)) errors.push(`bad id: ${a.id}`);
    if (!a.title?.trim()) errors.push(`missing title: ${a.id}`);
    if (!(KINDS as readonly string[]).includes(a.kind)) errors.push(`unknown kind: ${a.id}`);
    const [lng, lat] = a.lngLat ?? [NaN, NaN];
    if (!(lng >= w && lng <= e && lat >= s && lat <= n)) errors.push(`outside region: ${a.id}`);
    if (a.image && !(a.image.credit?.trim() && a.image.license?.trim() && a.image.page?.trim()))
      errors.push(`image without credit or licence: ${a.id}`);
  }
  return errors;
}

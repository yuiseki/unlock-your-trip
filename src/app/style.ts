// OpenFreeMap's Liberty style labels places with the Latin name and the
// local name together. For a Japanese trip we want Japanese only, falling
// back to the local name where no Japanese name is tagged.
const JAPANESE = ["coalesce", ["get", "name:ja"], ["get", "name"]];

function mentionsName(value: unknown): boolean {
  if (typeof value === "string") return /^name(:|$)/.test(value) || /\{name(:[^}]*)?\}/.test(value);
  if (Array.isArray(value)) return value.some(mentionsName);
  return false;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function japaneseLabels<T extends { layers: any[] }>(style: T): T {
  const out = structuredClone(style);
  for (const layer of out.layers) {
    const field = layer.layout?.["text-field"];
    if (field !== undefined && mentionsName(field)) layer.layout["text-field"] = JAPANESE;
  }
  return out;
}

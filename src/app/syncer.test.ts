import "fake-indexeddb/auto";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { openStore, type Store } from "./store";
import { setStars, type Prefs } from "./prefs";
import { createSyncer } from "./syncer";

let store: Store;
let n = 0;
let prefs: Prefs;
beforeEach(async () => {
  store = await openStore(`syncer-${n++}`);
  prefs = { stars: {}, collapsed: [], starTimes: {}, starPending: [] };
});

const json = (body: unknown) => new Response(JSON.stringify(body), { status: 200 });
// A server that answers both endpoints and remembers what it was sent.
function server() {
  const seen: { url: string; body: unknown; auth: string | null }[] = [];
  const fetcher = vi.fn(async (url: string, init: RequestInit) => {
    const body = JSON.parse(init.body as string);
    seen.push({ url, body, auth: (init.headers as Record<string, string>).authorization ?? null });
    if (url === "/api/unlocks") return json({ user: "yuiseki", unlocks: body.unlocks });
    return json({ user: "yuiseki", stars: [...body.stars, { achievementId: "suito", stars: 4, updatedAt: "2026-11-12T00:00:00.000Z" }] });
  });
  return { fetcher: fetcher as unknown as typeof fetch, seen };
}
// A request that never answers unless it is aborted.
const hanging = (async (_url: string, init: RequestInit) =>
  new Promise((_, reject) => init.signal?.addEventListener("abort", () => reject(init.signal!.reason)))) as unknown as typeof fetch;

function make(over: Partial<Parameters<typeof createSyncer>[0]> = {}) {
  return createSyncer({
    canWrite: () => true,
    getToken: async () => "t",
    store,
    getPrefs: () => prefs,
    setPrefs: (p) => (prefs = p),
    knownIds: () => new Set(["osaka-castle", "suito", "tekijuku"]),
    onChange: () => {},
    timeoutMs: 50,
    now: () => "2026-11-12T03:00:00.000Z",
    ...over,
  });
}

describe("createSyncer", () => {
  it("sends unsent unlocks and stars, takes in the server's stars, and reports when it synced", async () => {
    const { fetcher, seen } = server();
    await store.unlock("osaka-castle", "2026-11-12T01:00:00.000Z");
    prefs = setStars(prefs, "tekijuku", 5, "2026-11-12T01:00:00.000Z");
    const s = make({ fetcher });
    await s.trySync();
    expect(seen.map((x) => x.url)).toEqual(["/api/unlocks", "/api/stars"]);
    expect(seen.every((x) => x.auth === "Bearer t")).toBe(true);
    expect(await store.pending()).toEqual([]);
    expect(prefs.starPending).toEqual([]);
    expect(prefs.stars).toEqual({ tekijuku: 5, suito: 4 });
    expect(s.status()).toEqual({ ok: true, at: "2026-11-12T03:00:00.000Z" });
  });

  it("waits for a token, and syncs once one is there", async () => {
    const { fetcher, seen } = server();
    let token: string | null = null;
    const s = make({ fetcher, getToken: async () => token });
    await s.trySync();
    expect(seen).toEqual([]);
    expect(s.status()).toEqual({ ok: false, error: "no token" });
    token = "t";
    await s.trySync();
    expect(seen).toHaveLength(2);
  });

  it("gives up on a request that never answers, so later syncs still run", async () => {
    let fetcher = hanging;
    const s = make({ fetcher: ((u: string, i: RequestInit) => fetcher(u, i)) as unknown as typeof fetch });
    await s.trySync();
    expect(s.status()).toMatchObject({ ok: false });
    const ok = server();
    fetcher = ok.fetcher;
    await s.trySync();
    expect(ok.seen).toHaveLength(2);
    expect(s.status()).toMatchObject({ ok: true });
  });

  it("gives up on a token that never comes", async () => {
    const s = make({ getToken: () => new Promise(() => {}) });
    await s.trySync();
    expect(s.status()).toMatchObject({ ok: false });
  });

  it("runs once more for a change made while a sync is under way", async () => {
    const { fetcher, seen } = server();
    const s = make({ fetcher });
    const first = s.trySync();
    prefs = setStars(prefs, "tekijuku", 2, "2026-11-12T02:00:00.000Z");
    const second = s.trySync();
    await Promise.all([first, second]);
    const starBodies = seen.filter((x) => x.url === "/api/stars").map((x) => x.body);
    expect(starBodies).toHaveLength(2);
    expect(starBodies).toContainEqual({ stars: [{ achievementId: "tekijuku", stars: 2, updatedAt: "2026-11-12T02:00:00.000Z" }] });
    expect(prefs.starPending).toEqual([]);
  });

  it("lets the page redraw after every sync, failed or not", async () => {
    const onChange = vi.fn();
    await make({ onChange, getToken: async () => null }).trySync();
    expect(onChange).toHaveBeenCalledTimes(1);
  });

  it("does nothing for someone who cannot write", async () => {
    const { fetcher, seen } = server();
    await make({ fetcher, canWrite: () => false }).trySync();
    expect(seen).toEqual([]);
  });
});

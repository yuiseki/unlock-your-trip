import { env, SELF } from "cloudflare:test";
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { sha256Hex } from "./index";
import { makeSigner } from "./test/jwt";

const TOKEN = "test-token-for-yuiseki";
const BASE = "https://example.com";

async function post(body: unknown, token: string | null = TOKEN) {
  return SELF.fetch(`${BASE}/api/unlocks`, {
    method: "POST",
    headers: { "content-type": "application/json", ...(token ? { authorization: `Bearer ${token}` } : {}) },
    body: JSON.stringify(body),
  });
}

beforeEach(async () => {
  await env.DB.prepare("DELETE FROM unlocks").run();
  await env.DB.prepare("DELETE FROM stars").run();
  await env.DB.prepare("DELETE FROM photos").run();
  await env.DB.prepare("DELETE FROM users").run();
  await env.DB.prepare("INSERT INTO users (id, token_sha256, created_at) VALUES (?, ?, ?)")
    .bind("yuiseki", await sha256Hex(TOKEN), "2026-11-10T00:00:00.000Z")
    .run();
});

describe("POST /api/unlocks", () => {
  it("rejects a request without a valid token", async () => {
    expect((await post({ unlocks: [] }, null)).status).toBe(401);
    expect((await post({ unlocks: [] }, "wrong")).status).toBe(401);
  });

  it("saves unlocks and returns everything the person has unlocked", async () => {
    const res = await post({ unlocks: [{ achievementId: "osaka-castle", unlockedAt: "2026-11-13T03:00:00.000Z" }] });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({
      user: "yuiseki",
      unlocks: [{ achievementId: "osaka-castle", unlockedAt: "2026-11-13T03:00:00.000Z" }],
    });
  });

  it("keeps one row per achievement and the earliest time", async () => {
    await post({ unlocks: [{ achievementId: "osaka-castle", unlockedAt: "2026-11-13T05:00:00.000Z" }] });
    await post({ unlocks: [{ achievementId: "osaka-castle", unlockedAt: "2026-11-13T03:00:00.000Z" }] });
    const res = await post({ unlocks: [{ achievementId: "osaka-castle", unlockedAt: "2026-11-13T09:00:00.000Z" }] });
    expect(((await res.json()) as { unlocks: unknown }).unlocks).toEqual([{ achievementId: "osaka-castle", unlockedAt: "2026-11-13T03:00:00.000Z" }]);
  });

  it("rejects malformed unlocks without saving any of the batch", async () => {
    const res = await post({
      unlocks: [
        { achievementId: "osaka-castle", unlockedAt: "2026-11-13T03:00:00.000Z" },
        { achievementId: "Bad Id", unlockedAt: "yesterday" },
      ],
    });
    expect(res.status).toBe(400);
    const count = await env.DB.prepare("SELECT count(*) AS n FROM unlocks").first<{ n: number }>();
    expect(count?.n).toBe(0);
  });
});

describe("GET /api/users/:id/unlocks", () => {
  it("is readable by anyone", async () => {
    await post({ unlocks: [{ achievementId: "okinawa-steak", unlockedAt: "2026-11-13T04:00:00.000Z" }] });
    const res = await SELF.fetch(`${BASE}/api/users/yuiseki/unlocks`);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({
      user: "yuiseki",
      unlocks: [{ achievementId: "okinawa-steak", unlockedAt: "2026-11-13T04:00:00.000Z" }],
    });
  });

  it("returns 404 for someone who does not exist", async () => {
    expect((await SELF.fetch(`${BASE}/api/users/nobody/unlocks`)).status).toBe(404);
  });
});

describe("Clerk sign-in", () => {
  // Matches the test bindings in vitest.config.ts.
  const ISSUER = "https://test.clerk.accounts.dev";
  const APP = "https://unlock.example";
  const now = () => Math.floor(Date.now() / 1000);
  let signer: Awaited<ReturnType<typeof makeSigner>>;
  const token = (over: Record<string, unknown> = {}) =>
    signer.sign({ iss: ISSUER, sub: "user_yui", sid: "sess_1", azp: APP, iat: now(), nbf: now() - 5, exp: now() + 60, ...over });

  beforeAll(async () => {
    signer = await makeSigner("ins_1");
  });
  beforeEach(async () => {
    await env.DB.prepare("UPDATE users SET clerk_user_id = 'user_yui' WHERE id = 'yuiseki'").run();
    vi.spyOn(globalThis, "fetch").mockImplementation(async (input) => {
      const url = input instanceof Request ? input.url : String(input);
      if (url === `${ISSUER}/.well-known/jwks.json`) return Response.json({ keys: [signer.jwk] });
      throw new Error(`unexpected fetch ${url}`);
    });
  });
  afterEach(() => vi.restoreAllMocks());

  const me = async (t: string | null) => SELF.fetch(`${BASE}/api/me`, { headers: t ? { authorization: `Bearer ${t}` } : {} });

  it("tells the page which Clerk instance to use", async () => {
    const res = await SELF.fetch(`${BASE}/api/config`);
    expect(await res.json()).toEqual({ clerkPublishableKey: `pk_test_${btoa("test.clerk.accounts.dev$")}` });
  });

  it("lets a registered Clerk user write", async () => {
    const t = await token();
    expect(await (await me(t)).json()).toEqual({ user: "yuiseki" });
    const res = await post({ unlocks: [{ achievementId: "osaka-castle", unlockedAt: "2026-11-13T03:00:00.000Z" }] }, t);
    expect(res.status).toBe(200);
    expect(((await res.json()) as { user: string }).user).toBe("yuiseki");
  });

  it("tells a signed-in but unregistered person their Clerk ID, and does not let them write", async () => {
    const t = await token({ sub: "user_stranger" });
    const res = await me(t);
    expect(res.status).toBe(403);
    expect(await res.json()).toEqual({ error: "not registered", clerkUserId: "user_stranger" });
    expect((await post({ unlocks: [] }, t)).status).toBe(403);
  });

  it("rejects tokens that do not verify", async () => {
    expect((await me(await token({ azp: "https://evil.example" }))).status).toBe(401);
    expect((await me(await token({ exp: now() - 120 }))).status).toBe(401);
    expect((await me(null)).status).toBe(401);
  });

  it("still accepts the setup-link token", async () => {
    expect(await (await me(TOKEN)).json()).toEqual({ user: "yuiseki" });
    expect((await post({ unlocks: [] })).status).toBe(200);
  });
});

describe("POST /api/stars", () => {
  const T1 = "2026-11-10T01:00:00.000Z";
  const T2 = "2026-11-10T02:00:00.000Z";
  const send = (stars: unknown, token: string | null = TOKEN) =>
    SELF.fetch(`${BASE}/api/stars`, {
      method: "POST",
      headers: { "content-type": "application/json", ...(token ? { authorization: `Bearer ${token}` } : {}) },
      body: JSON.stringify({ stars }),
    });
  const starsOf = async (res: Response) => ((await res.json()) as { stars: unknown[] }).stars;

  it("needs a writer", async () => {
    expect((await send([], null)).status).toBe(401);
  });

  it("keeps the newest rating per achievement and returns them all", async () => {
    await send([{ achievementId: "suito", stars: 2, updatedAt: T1 }]);
    await send([{ achievementId: "suito", stars: 5, updatedAt: T2 }, { achievementId: "tekijuku", stars: 4, updatedAt: T1 }]);
    const res = await send([{ achievementId: "suito", stars: 1, updatedAt: T1 }]);
    expect(await starsOf(res)).toEqual([
      { achievementId: "suito", stars: 5, updatedAt: T2 },
      { achievementId: "tekijuku", stars: 4, updatedAt: T1 },
    ]);
  });

  it("does not let a clock in the future win forever", async () => {
    const res = await send([{ achievementId: "suito", stars: 5, updatedAt: "2099-01-01T00:00:00.000Z" }]);
    const [row] = (await starsOf(res)) as { updatedAt: string }[];
    expect(Date.parse(row.updatedAt)).toBeLessThanOrEqual(Date.now());
  });

  it("rejects malformed ratings without saving any of the batch", async () => {
    const res = await send([{ achievementId: "suito", stars: 4, updatedAt: T1 }, { achievementId: "suito", stars: 9, updatedAt: T1 }]);
    expect(res.status).toBe(400);
    expect(await env.DB.prepare("SELECT count(*) AS n FROM stars").first<{ n: number }>()).toEqual({ n: 0 });
  });

  it("is not part of the public page", async () => {
    await send([{ achievementId: "suito", stars: 4, updatedAt: T1 }]);
    expect(await (await SELF.fetch(`${BASE}/api/users/yuiseki/unlocks`)).json()).not.toHaveProperty("stars");
  });
});

describe("GET /api/users/:id/photos", () => {
  const G1 = "a".repeat(32);
  const G2 = "b".repeat(32);
  it("is readable by anyone, oldest photo first per achievement", async () => {
    const add = env.DB.prepare("INSERT INTO photos (user_id, achievement_id, gyazo_id, taken_at) VALUES ('yuiseki', ?, ?, ?)");
    await env.DB.batch([add.bind("okinawa-soba", G2, "2023-03-12T05:00:00.000Z"), add.bind("okinawa-soba", G1, "2023-03-12T04:00:00.000Z")]);
    const res = await SELF.fetch(`${BASE}/api/users/yuiseki/photos`);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({
      user: "yuiseki",
      photos: [
        { achievementId: "okinawa-soba", gyazoId: G1, takenAt: "2023-03-12T04:00:00.000Z" },
        { achievementId: "okinawa-soba", gyazoId: G2, takenAt: "2023-03-12T05:00:00.000Z" },
      ],
    });
  });

  it("returns 404 for someone who does not exist", async () => {
    expect((await SELF.fetch(`${BASE}/api/users/nobody/photos`)).status).toBe(404);
  });
});

// Osaka is a planned trip, and osaka-castle is one of its achievements.
describe("planned trips publish unlocked achievements", () => {
  const G = "c".repeat(32);
  beforeEach(async () => {
    const u = env.DB.prepare("INSERT INTO unlocks (user_id, achievement_id, unlocked_at, received_at) VALUES ('yuiseki', ?, '2026-11-13T03:00:00.000Z', '2026-11-13T03:00:00.000Z')");
    const ph = env.DB.prepare("INSERT INTO photos (user_id, achievement_id, gyazo_id, taken_at) VALUES ('yuiseki', ?, ?, '2026-11-13T03:00:00.000Z')");
    await env.DB.batch([u.bind("osaka-castle"), u.bind("okinawa-steak"), ph.bind("osaka-castle", G), ph.bind("okinawa-steak", G)]);
  });
  const ids = async (res: Response, key: "unlocks" | "photos") => ((await res.json()) as Record<string, { achievementId: string }[]>)[key].map((x) => x.achievementId).sort();

  it("shows unlocked achievements and photos in the public record", async () => {
    expect(await ids(await SELF.fetch(`${BASE}/api/users/yuiseki/unlocks`), "unlocks")).toEqual(["okinawa-steak", "osaka-castle"]);
    expect(await ids(await SELF.fetch(`${BASE}/api/users/yuiseki/photos`), "photos")).toEqual(["okinawa-steak", "osaka-castle"]);
  });

  it("shows them to the owner signed in", async () => {
    const auth = { headers: { authorization: `Bearer ${TOKEN}` } };
    expect(await ids(await SELF.fetch(`${BASE}/api/users/yuiseki/unlocks`, auth), "unlocks")).toEqual(["okinawa-steak", "osaka-castle"]);
    expect(await ids(await SELF.fetch(`${BASE}/api/users/yuiseki/photos`, auth), "photos")).toEqual(["okinawa-steak", "osaka-castle"]);
  });

  it("shows unlocked achievements to another writer", async () => {
    await env.DB.prepare("INSERT INTO users (id, token_sha256, created_at) VALUES ('other', ?, '2026-11-10T00:00:00.000Z')").bind(await sha256Hex("other-token")).run();
    const res = await SELF.fetch(`${BASE}/api/users/yuiseki/unlocks`, { headers: { authorization: "Bearer other-token" } });
    expect(await ids(res, "unlocks")).toEqual(["okinawa-steak", "osaka-castle"]);
  });

  it("counts a photo as an unlock at its earliest timestamp", async () => {
    await env.DB.prepare("INSERT INTO photos (user_id, achievement_id, gyazo_id, taken_at) VALUES ('yuiseki', 'dotonbori-glico', ?, '2026-11-13T02:00:00.000Z')").bind(G).run();
    const res = await SELF.fetch(`${BASE}/api/users/yuiseki/unlocks`);
    const body = await res.json() as { unlocks: { achievementId: string; unlockedAt: string }[] };
    expect(body.unlocks).toContainEqual({ achievementId: "dotonbori-glico", unlockedAt: "2026-11-13T02:00:00.000Z" });
    expect(await ids(await SELF.fetch(`${BASE}/api/users/yuiseki/photos`), "photos")).toContain("dotonbori-glico");
  });
});

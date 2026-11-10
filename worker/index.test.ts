import { env, SELF } from "cloudflare:test";
import { beforeEach, describe, expect, it } from "vitest";
import { sha256Hex } from "./index";

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
    await post({ unlocks: [{ achievementId: "tsutenkaku", unlockedAt: "2026-11-13T04:00:00.000Z" }] });
    const res = await SELF.fetch(`${BASE}/api/users/yuiseki/unlocks`);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({
      user: "yuiseki",
      unlocks: [{ achievementId: "tsutenkaku", unlockedAt: "2026-11-13T04:00:00.000Z" }],
    });
  });

  it("returns 404 for someone who does not exist", async () => {
    expect((await SELF.fetch(`${BASE}/api/users/nobody/unlocks`)).status).toBe(404);
  });
});

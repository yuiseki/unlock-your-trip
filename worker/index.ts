// API for unlock-your-trip. Static files (the app and the catalogues) are
// served by Workers static assets; only /api/* reaches this code.
export type Env = { DB: D1Database };

type Unlock = { achievementId: string; unlockedAt: string };

const SLUG = /^[a-z0-9]+(-[a-z0-9]+)*$/;
const ISO = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d{1,3})?Z$/;
const MAX_BATCH = 200;

export async function sha256Hex(text: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json; charset=utf-8" } });

async function userFromToken(request: Request, env: Env): Promise<string | null> {
  const m = /^Bearer (.+)$/.exec(request.headers.get("authorization") ?? "");
  if (!m) return null;
  const row = await env.DB.prepare("SELECT id FROM users WHERE token_sha256 = ?").bind(await sha256Hex(m[1])).first<{ id: string }>();
  return row?.id ?? null;
}

async function unlocksOf(env: Env, user: string): Promise<Unlock[]> {
  const { results } = await env.DB.prepare(
    "SELECT achievement_id AS achievementId, unlocked_at AS unlockedAt FROM unlocks WHERE user_id = ? ORDER BY unlocked_at, achievement_id",
  )
    .bind(user)
    .all<Unlock>();
  return results;
}

function parseUnlocks(body: unknown): Unlock[] | null {
  const list = (body as { unlocks?: unknown })?.unlocks;
  if (!Array.isArray(list) || list.length > MAX_BATCH) return null;
  for (const u of list) {
    if (typeof u?.achievementId !== "string" || !SLUG.test(u.achievementId)) return null;
    if (typeof u?.unlockedAt !== "string" || !ISO.test(u.unlockedAt) || Number.isNaN(Date.parse(u.unlockedAt))) return null;
  }
  return list.map((u) => ({ achievementId: u.achievementId, unlockedAt: new Date(u.unlockedAt).toISOString() }));
}

async function postUnlocks(request: Request, env: Env): Promise<Response> {
  const user = await userFromToken(request, env);
  if (!user) return json({ error: "unauthorized" }, 401);
  const unlocks = parseUnlocks(await request.json().catch(() => null));
  if (!unlocks) return json({ error: "bad request" }, 400);
  const now = new Date().toISOString();
  // The earliest unlock wins, so resending an old unlock never moves it.
  const stmt = env.DB.prepare(
    `INSERT INTO unlocks (user_id, achievement_id, unlocked_at, received_at) VALUES (?, ?, ?, ?)
     ON CONFLICT (user_id, achievement_id) DO UPDATE SET unlocked_at = min(unlocked_at, excluded.unlocked_at)`,
  );
  if (unlocks.length) await env.DB.batch(unlocks.map((u) => stmt.bind(user, u.achievementId, u.unlockedAt, now)));
  return json({ user, unlocks: await unlocksOf(env, user) });
}

async function getUnlocks(user: string, env: Env): Promise<Response> {
  const exists = await env.DB.prepare("SELECT 1 FROM users WHERE id = ?").bind(user).first();
  if (!exists) return json({ error: "not found" }, 404);
  return json({ user, unlocks: await unlocksOf(env, user) });
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    if (url.pathname === "/api/unlocks" && request.method === "POST") return postUnlocks(request, env);
    const m = /^\/api\/users\/([a-z0-9-]{1,40})\/unlocks$/.exec(url.pathname);
    if (m && request.method === "GET") return getUnlocks(m[1], env);
    return json({ error: "not found" }, 404);
  },
} satisfies ExportedHandler<Env>;

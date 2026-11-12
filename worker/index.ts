// API for unlock-your-trip. Static files (the app and the catalogues) are
// served by Workers static assets; only /api/* reaches this code.
import { clerkFrontendApi } from "../src/shared/clerk";
import { clerkKeys, verifyClerkToken } from "./clerk";

export type Env = { DB: D1Database; CLERK_PUBLISHABLE_KEY: string; CLERK_AUTHORIZED_PARTIES: string };

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

type Writer = { user: string } | { error: Response };

// The bearer is either a setup-link token (random hex) or a Clerk session
// token (a JWT, so it has dots). A Clerk user who is signed in but not on
// any row is told their ID, which is what the administrator registers.
async function writer(request: Request, env: Env): Promise<Writer> {
  const unauthorized = { error: json({ error: "unauthorized" }, 401) };
  const m = /^Bearer (.+)$/.exec(request.headers.get("authorization") ?? "");
  if (!m) return unauthorized;
  if (!m[1].includes(".")) {
    const row = await env.DB.prepare("SELECT id FROM users WHERE token_sha256 = ?").bind(await sha256Hex(m[1])).first<{ id: string }>();
    return row ? { user: row.id } : unauthorized;
  }
  const host = clerkFrontendApi(env.CLERK_PUBLISHABLE_KEY ?? "");
  if (!host) return unauthorized;
  const issuer = `https://${host}`;
  const parties = (env.CLERK_AUTHORIZED_PARTIES ?? "").split(",").map((s) => s.trim()).filter(Boolean);
  const clerkUser = await verifyClerkToken(m[1], { issuer, authorizedParties: parties, keys: clerkKeys(issuer) });
  if (!clerkUser) return unauthorized;
  const row = await env.DB.prepare("SELECT id FROM users WHERE clerk_user_id = ?").bind(clerkUser).first<{ id: string }>();
  return row ? { user: row.id } : { error: json({ error: "not registered", clerkUserId: clerkUser }, 403) };
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
  const w = await writer(request, env);
  if ("error" in w) return w.error;
  const user = w.user;
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

type Star = { achievementId: string; stars: number; updatedAt: string };

function parseStars(body: unknown): Star[] | null {
  const list = (body as { stars?: unknown })?.stars;
  if (!Array.isArray(list) || list.length > MAX_BATCH) return null;
  for (const s of list) {
    if (typeof s?.achievementId !== "string" || !SLUG.test(s.achievementId)) return null;
    if (!Number.isInteger(s?.stars) || s.stars < 1 || s.stars > 5) return null;
    if (typeof s?.updatedAt !== "string" || !ISO.test(s.updatedAt) || Number.isNaN(Date.parse(s.updatedAt))) return null;
  }
  // A device whose clock runs ahead would otherwise win every later change.
  const now = Date.now();
  return list.map((s) => ({ achievementId: s.achievementId, stars: s.stars, updatedAt: new Date(Math.min(Date.parse(s.updatedAt), now)).toISOString() }));
}

// Ratings are the writer's own and are not on the public page.
async function postStars(request: Request, env: Env): Promise<Response> {
  const w = await writer(request, env);
  if ("error" in w) return w.error;
  const stars = parseStars(await request.json().catch(() => null));
  if (!stars) return json({ error: "bad request" }, 400);
  const stmt = env.DB.prepare(
    `INSERT INTO stars (user_id, achievement_id, stars, updated_at) VALUES (?, ?, ?, ?)
     ON CONFLICT (user_id, achievement_id) DO UPDATE SET stars = excluded.stars, updated_at = excluded.updated_at
     WHERE excluded.updated_at > stars.updated_at`,
  );
  if (stars.length) await env.DB.batch(stars.map((s) => stmt.bind(w.user, s.achievementId, s.stars, s.updatedAt)));
  const { results } = await env.DB.prepare(
    "SELECT achievement_id AS achievementId, stars, updated_at AS updatedAt FROM stars WHERE user_id = ? ORDER BY achievement_id",
  )
    .bind(w.user)
    .all<Star>();
  return json({ user: w.user, stars: results });
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
    if (url.pathname === "/api/stars" && request.method === "POST") return postStars(request, env);
    if (url.pathname === "/api/me" && request.method === "GET") {
      const w = await writer(request, env);
      return "error" in w ? w.error : json({ user: w.user });
    }
    if (url.pathname === "/api/config" && request.method === "GET") return json({ clerkPublishableKey: env.CLERK_PUBLISHABLE_KEY });
    const m = /^\/api\/users\/([a-z0-9-]{1,40})\/unlocks$/.exec(url.pathname);
    if (m && request.method === "GET") return getUnlocks(m[1], env);
    return json({ error: "not found" }, 404);
  },
} satisfies ExportedHandler<Env>;

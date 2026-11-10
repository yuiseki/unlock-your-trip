import type { RemoteUnlock, Store } from "./store";

export type SyncResult = { ok: true; sent: number } | { ok: false; error: string };

type Options = { token: string | null; fetcher?: typeof fetch; endpoint?: string };

// Sends every unlock the server has not confirmed yet. Anything that goes
// wrong leaves the unlocks pending for the next try; nothing is dropped.
export async function sync(store: Store, { token, fetcher = fetch, endpoint = "/api/unlocks" }: Options): Promise<SyncResult> {
  if (!token) return { ok: false, error: "no token" };
  const pending = await store.pending();
  let res: Response;
  try {
    res = await fetcher(endpoint, {
      method: "POST",
      headers: { "content-type": "application/json", authorization: `Bearer ${token}` },
      body: JSON.stringify({ unlocks: pending.map(({ achievementId, unlockedAt }) => ({ achievementId, unlockedAt })) }),
    });
  } catch (e) {
    return { ok: false, error: String(e) };
  }
  if (!res.ok) return { ok: false, error: `HTTP ${res.status}` };
  const body = (await res.json()) as { unlocks: RemoteUnlock[] };
  await store.markSynced(pending.map((u) => u.achievementId));
  await store.mergeRemote(body.unlocks);
  return { ok: true, sent: pending.length };
}

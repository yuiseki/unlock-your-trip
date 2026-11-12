// When and how the page talks to the server: unlocks first, then stars, one
// sync at a time. Every wait has a time limit, because a request that never
// answers on a weak signal would otherwise hold up every later sync.
import { applyStarSync, pendingStars, type Prefs } from "./prefs";
import type { Store } from "./store";
import { sync, syncStars } from "./sync";

export type SyncStatus = { ok: true; at: string } | { ok: false; error: string } | null;

type Deps = {
  canWrite: () => boolean;
  getToken: () => Promise<string | null>;
  store: Store;
  getPrefs: () => Prefs;
  setPrefs: (p: Prefs) => void;
  knownIds: () => Set<string>;
  onChange: () => void;
  fetcher?: typeof fetch;
  timeoutMs?: number;
  now?: () => string;
};

function within<T>(ms: number, p: Promise<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    const t = setTimeout(() => reject(new Error("timed out")), ms);
    p.then(
      (v) => (clearTimeout(t), resolve(v)),
      (e) => (clearTimeout(t), reject(e)),
    );
  });
}

export function createSyncer(d: Deps) {
  const ms = d.timeoutMs ?? 15_000;
  const base = d.fetcher ?? ((...a: Parameters<typeof fetch>) => fetch(...a));
  const fetcher = ((url: RequestInfo | URL, init: RequestInit = {}) => base(url, { ...init, signal: AbortSignal.timeout(ms) })) as typeof fetch;
  const now = d.now ?? (() => new Date().toISOString());
  let status: SyncStatus = null;
  let running: Promise<void> | null = null;
  let again = false;

  async function once() {
    if (!d.canWrite()) return;
    let token: string | null;
    try {
      token = await within(ms, d.getToken());
    } catch (e) {
      status = { ok: false, error: `token: ${String(e)}` };
      return;
    }
    if (!token) {
      status = { ok: false, error: "no token" };
      return;
    }
    const u = await sync(d.store, { token, fetcher });
    const sent = pendingStars(d.getPrefs());
    const s = await syncStars(sent, { token, fetcher });
    if (s.ok) {
      const known = d.knownIds();
      d.setPrefs(applyStarSync(d.getPrefs(), sent, s.remote.filter((x) => known.has(x.achievementId))));
    }
    status = u.ok && s.ok ? { ok: true, at: now() } : { ok: false, error: !u.ok ? u.error : (s as { error: string }).error };
  }

  function trySync(): Promise<void> {
    if (running) {
      again = true;
      return running;
    }
    running = (async () => {
      do {
        again = false;
        try {
          await once();
        } catch (e) {
          status = { ok: false, error: String(e) };
        }
        // Also after a failure, so the page shows the new status.
        d.onChange();
      } while (again);
    })().finally(() => (running = null));
    return running;
  }

  return { trySync, status: () => status };
}

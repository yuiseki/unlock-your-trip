// The device keeps its own copy of every unlock and writes it here before
// anything is sent. A weak signal at a sightseeing spot must never lose an
// unlock, so the network copy is a second step that can be retried.
export type Unlock = { achievementId: string; unlockedAt: string; synced: boolean };
export type RemoteUnlock = { achievementId: string; unlockedAt: string };

export type Store = {
  unlock(achievementId: string, at: string): Promise<Unlock>;
  all(): Promise<Unlock[]>;
  pending(): Promise<Unlock[]>;
  markSynced(ids: string[]): Promise<void>;
  mergeRemote(remote: RemoteUnlock[]): Promise<void>;
  close(): void;
};

const STORE = "unlocks";

function req<T>(r: IDBRequest<T>): Promise<T> {
  return new Promise((ok, ng) => {
    r.onsuccess = () => ok(r.result);
    r.onerror = () => ng(r.error);
  });
}

function done(tx: IDBTransaction): Promise<void> {
  return new Promise((ok, ng) => {
    tx.oncomplete = () => ok();
    tx.onerror = () => ng(tx.error);
    tx.onabort = () => ng(tx.error);
  });
}

export async function openStore(name = "unlock-your-trip"): Promise<Store> {
  const open = indexedDB.open(name, 1);
  open.onupgradeneeded = () => open.result.createObjectStore(STORE, { keyPath: "achievementId" });
  const db = await req(open);

  const all = async () => {
    const rows = (await req(db.transaction(STORE).objectStore(STORE).getAll())) as Unlock[];
    return rows.sort((a, b) => a.unlockedAt.localeCompare(b.unlockedAt));
  };

  // Write the record only if there is none yet, or if the new one is older
  // (an earlier unlock wins). Everything happens in one transaction.
  const put = async (u: Unlock) => {
    const tx = db.transaction(STORE, "readwrite");
    const os = tx.objectStore(STORE);
    const prev = (await req(os.get(u.achievementId))) as Unlock | undefined;
    let result = prev ?? u;
    if (!prev) os.put(u);
    else if (u.unlockedAt < prev.unlockedAt || (u.synced && !prev.synced && u.unlockedAt <= prev.unlockedAt)) {
      result = { ...u, synced: u.synced || prev.synced };
      os.put(result);
    }
    await done(tx);
    return result;
  };

  return {
    unlock: (achievementId, at) => put({ achievementId, unlockedAt: at, synced: false }),
    all,
    pending: async () => (await all()).filter((u) => !u.synced),
    async markSynced(ids) {
      const tx = db.transaction(STORE, "readwrite");
      const os = tx.objectStore(STORE);
      for (const id of ids) {
        const u = (await req(os.get(id))) as Unlock | undefined;
        if (u) os.put({ ...u, synced: true });
      }
      await done(tx);
    },
    async mergeRemote(remote) {
      for (const r of remote) await put({ ...r, synced: true });
    },
    close: () => db.close(),
  };
}

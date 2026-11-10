import "fake-indexeddb/auto";
import { beforeEach, describe, expect, it } from "vitest";
import { openStore, type Store } from "./store";

let store: Store;
let n = 0;
beforeEach(async () => {
  store = await openStore(`test-${n++}`);
});

describe("unlock store", () => {
  it("records an unlock with its time and marks it as not yet sent", async () => {
    await store.unlock("osaka-castle", "2026-11-13T03:00:00.000Z");
    expect(await store.all()).toEqual([{ achievementId: "osaka-castle", unlockedAt: "2026-11-13T03:00:00.000Z", synced: false }]);
  });

  it("keeps the first time when the same achievement is unlocked twice", async () => {
    await store.unlock("osaka-castle", "2026-11-13T03:00:00.000Z");
    await store.unlock("osaka-castle", "2026-11-13T05:00:00.000Z");
    const all = await store.all();
    expect(all).toHaveLength(1);
    expect(all[0].unlockedAt).toBe("2026-11-13T03:00:00.000Z");
  });

  it("lists unsent unlocks and forgets them only once marked as sent", async () => {
    await store.unlock("a", "2026-11-13T03:00:00.000Z");
    await store.unlock("b", "2026-11-13T04:00:00.000Z");
    expect((await store.pending()).map((u) => u.achievementId)).toEqual(["a", "b"]);
    await store.markSynced(["a"]);
    expect((await store.pending()).map((u) => u.achievementId)).toEqual(["b"]);
    expect(await store.all()).toHaveLength(2);
  });

  it("survives reopening the database", async () => {
    const name = `reopen-${n++}`;
    const s1 = await openStore(name);
    await s1.unlock("a", "2026-11-13T03:00:00.000Z");
    s1.close();
    const s2 = await openStore(name);
    expect((await s2.all()).map((u) => u.achievementId)).toEqual(["a"]);
  });

  it("accepts unlocks confirmed by the server without marking them pending", async () => {
    await store.mergeRemote([{ achievementId: "c", unlockedAt: "2026-11-12T01:00:00.000Z" }]);
    expect(await store.pending()).toEqual([]);
    expect((await store.all())[0]).toMatchObject({ achievementId: "c", synced: true });
  });
});

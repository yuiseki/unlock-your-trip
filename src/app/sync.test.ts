import "fake-indexeddb/auto";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { openStore, type Store } from "./store";
import { sync } from "./sync";

let store: Store;
let n = 0;
beforeEach(async () => {
  store = await openStore(`sync-${n++}`);
});

const ok = (body: unknown) => new Response(JSON.stringify(body), { status: 200, headers: { "content-type": "application/json" } });

describe("sync", () => {
  it("sends pending unlocks, marks them sent, and takes in what the server has", async () => {
    await store.unlock("osaka-castle", "2026-11-13T03:00:00.000Z");
    const fetcher = vi.fn(async () =>
      ok({
        user: "yuiseki",
        unlocks: [
          { achievementId: "osaka-castle", unlockedAt: "2026-11-13T03:00:00.000Z" },
          { achievementId: "tsutenkaku", unlockedAt: "2026-11-12T01:00:00.000Z" },
        ],
      }),
    );
    const result = await sync(store, { token: "t", fetcher });
    expect(result).toEqual({ ok: true, sent: 1 });
    const [url, init] = fetcher.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("/api/unlocks");
    expect((init.headers as Record<string, string>).authorization).toBe("Bearer t");
    expect(JSON.parse(init.body as string)).toEqual({ unlocks: [{ achievementId: "osaka-castle", unlockedAt: "2026-11-13T03:00:00.000Z" }] });
    expect(await store.pending()).toEqual([]);
    expect((await store.all()).map((u) => u.achievementId).sort()).toEqual(["osaka-castle", "tsutenkaku"]);
  });

  it("keeps unlocks pending when the network fails", async () => {
    await store.unlock("osaka-castle", "2026-11-13T03:00:00.000Z");
    const result = await sync(store, { token: "t", fetcher: async () => { throw new TypeError("offline"); } });
    expect(result.ok).toBe(false);
    expect((await store.pending()).map((u) => u.achievementId)).toEqual(["osaka-castle"]);
  });

  it("keeps unlocks pending when the server refuses", async () => {
    await store.unlock("osaka-castle", "2026-11-13T03:00:00.000Z");
    const result = await sync(store, { token: "t", fetcher: async () => new Response("{}", { status: 401 }) });
    expect(result).toEqual({ ok: false, error: "HTTP 401" });
    expect(await store.pending()).toHaveLength(1);
  });

  it("does nothing without a token", async () => {
    await store.unlock("osaka-castle", "2026-11-13T03:00:00.000Z");
    const fetcher = vi.fn();
    expect(await sync(store, { token: null, fetcher })).toEqual({ ok: false, error: "no token" });
    expect(fetcher).not.toHaveBeenCalled();
  });
});

import { describe, expect, it, vi } from "vitest";
import { whoAmI } from "./auth";

const reply = (status: number, body: unknown) => async () => new Response(JSON.stringify(body), { status });

describe("whoAmI", () => {
  it("names the writer the server knows", async () => {
    const fetcher = vi.fn(reply(200, { user: "yuiseki" }));
    expect(await whoAmI("t", fetcher)).toEqual({ kind: "writer", user: "yuiseki" });
    const [url, init] = fetcher.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("/api/me");
    expect((init.headers as Record<string, string>).authorization).toBe("Bearer t");
  });

  it("passes on the Clerk ID of someone signed in but not registered", async () => {
    expect(await whoAmI("t", reply(403, { error: "not registered", clerkUserId: "user_x" }))).toEqual({ kind: "unregistered", clerkUserId: "user_x" });
  });

  it("tells a rejected token apart from not reaching the server", async () => {
    expect(await whoAmI("t", reply(401, { error: "unauthorized" }))).toEqual({ kind: "rejected" });
    expect(await whoAmI("t", reply(500, {}))).toEqual({ kind: "unreachable" });
    expect(await whoAmI("t", async () => Promise.reject(new TypeError("offline")))).toEqual({ kind: "unreachable" });
  });
});

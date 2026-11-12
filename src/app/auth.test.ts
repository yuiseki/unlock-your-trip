import { describe, expect, it, vi } from "vitest";
import { userMenuItems, whoAmI, writesHere } from "./auth";

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

describe("userMenuItems", () => {
  it("adds a link to the writer's own record to Clerk's user menu", () => {
    expect(userMenuItems("yuiseki")).toEqual([{ label: "自分の実績", href: "/u/yuiseki/" }]);
  });

  it("adds nothing before the writer is known", () => {
    expect(userMenuItems(null)).toEqual([]);
  });
});

describe("writesHere", () => {
  it("lets a known writer write on their own pages only, never on someone's public page", () => {
    expect(writesHere(null, "yuiseki")).toBe(true);
    expect(writesHere(null, null)).toBe(false);
    expect(writesHere("yuiseki", "yuiseki")).toBe(false);
    expect(writesHere("someone", "yuiseki")).toBe(false);
  });
});

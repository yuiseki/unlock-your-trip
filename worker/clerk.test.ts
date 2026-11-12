import { describe, expect, it } from "vitest";
import { createLocalJWKSet } from "jose";
import { verifyClerkToken } from "./clerk";
import { makeSigner } from "./test/jwt";

const ISSUER = "https://test.clerk.accounts.dev";
const APP = "https://unlock.example";
const now = () => Math.floor(Date.now() / 1000);
const claims = (over: Record<string, unknown> = {}) => ({
  iss: ISSUER,
  sub: "user_abc",
  sid: "sess_1",
  azp: APP,
  iat: now() - 5,
  nbf: now() - 5,
  exp: now() + 60,
  ...over,
});

async function setup() {
  const s = await makeSigner("ins_1");
  const opts = { issuer: ISSUER, authorizedParties: [APP], keys: createLocalJWKSet({ keys: [s.jwk] }) };
  return { s, opts };
}

describe("verifyClerkToken", () => {
  it("returns the Clerk user of a valid session token", async () => {
    const { s, opts } = await setup();
    expect(await verifyClerkToken(await s.sign(claims()), opts)).toBe("user_abc");
  });

  it("accepts a token without azp", async () => {
    const { s, opts } = await setup();
    expect(await verifyClerkToken(await s.sign(claims({ azp: undefined })), opts)).toBe("user_abc");
  });

  it("rejects a token made for another origin, by another instance, or expired", async () => {
    const { s, opts } = await setup();
    expect(await verifyClerkToken(await s.sign(claims({ azp: "https://evil.example" })), opts)).toBeNull();
    expect(await verifyClerkToken(await s.sign(claims({ iss: "https://other.clerk.accounts.dev" })), opts)).toBeNull();
    expect(await verifyClerkToken(await s.sign(claims({ exp: now() - 120 })), opts)).toBeNull();
    expect(await verifyClerkToken(await s.sign(claims({ nbf: now() + 120 })), opts)).toBeNull();
  });

  it("rejects a token whose sign-up is still pending", async () => {
    const { s, opts } = await setup();
    expect(await verifyClerkToken(await s.sign(claims({ sts: "pending" })), opts)).toBeNull();
  });

  it("rejects a forged or malformed token", async () => {
    const { opts } = await setup();
    const forger = await makeSigner("ins_1");
    expect(await verifyClerkToken(await forger.sign(claims()), opts)).toBeNull();
    expect(await verifyClerkToken("a.b.c", opts)).toBeNull();
  });
});

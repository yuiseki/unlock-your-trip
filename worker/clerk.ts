// Verifies a Clerk session token with the instance's public keys, so the
// Worker needs no Clerk secret. The checks follow Clerk's "Manual JWT
// verification": signature (RS256), expiry and not-before, the issuing
// instance, the origin that asked for the token (azp), and no pending sign-up.
// https://clerk.com/docs/guides/sessions/manual-jwt-verification
import { createRemoteJWKSet, jwtVerify, type JWTVerifyGetKey } from "jose";

export type ClerkOptions = { issuer: string; authorizedParties: string[]; keys: JWTVerifyGetKey };

export async function verifyClerkToken(token: string, { issuer, authorizedParties, keys }: ClerkOptions): Promise<string | null> {
  try {
    const { payload } = await jwtVerify(token, keys, { issuer, algorithms: ["RS256"], clockTolerance: 5 });
    if (typeof payload.azp === "string" && !authorizedParties.includes(payload.azp)) return null;
    if (payload.sts === "pending") return null;
    return typeof payload.sub === "string" ? payload.sub : null;
  } catch {
    return null;
  }
}

// jose keeps the fetched keys and refetches when a token names a key it has
// not seen, so one set per instance serves every request in the isolate.
const remote = new Map<string, JWTVerifyGetKey>();
export function clerkKeys(issuer: string): JWTVerifyGetKey {
  let keys = remote.get(issuer);
  if (!keys) remote.set(issuer, (keys = createRemoteJWKSet(new URL(`${issuer}/.well-known/jwks.json`))));
  return keys;
}

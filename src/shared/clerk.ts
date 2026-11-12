// A Clerk publishable key is "pk_test_" or "pk_live_" followed by the
// base64 of the instance's Frontend API host and a "$". The page loads Clerk
// from that host, and the Worker trusts tokens issued by it.
export function clerkFrontendApi(publishableKey: string): string | null {
  const m = /^pk_(test|live)_([A-Za-z0-9+/=]+)$/.exec(publishableKey);
  if (!m) return null;
  let decoded: string;
  try {
    decoded = atob(m[2]);
  } catch {
    return null;
  }
  return /^[a-z0-9.-]+\$$/.test(decoded) ? decoded.slice(0, -1) : null;
}

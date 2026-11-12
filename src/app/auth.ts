// Signing in with Clerk (Google) on the page. Clerk's SDK comes from the
// instance's own Frontend API, and only on a writer's page: a public /u/<id>
// page never loads it.
import { clerkFrontendApi } from "../shared/clerk";

export type WhoAmI =
  | { kind: "writer"; user: string }
  | { kind: "unregistered"; clerkUserId: string }
  | { kind: "rejected" }
  | { kind: "unreachable" };

// "unreachable" is not a sign-out: a writer offline keeps unlocking on the
// device, and the unlocks wait for the next sync.
export async function whoAmI(token: string, fetcher: typeof fetch = fetch): Promise<WhoAmI> {
  let res: Response;
  try {
    res = await fetcher("/api/me", { headers: { authorization: `Bearer ${token}` } });
  } catch {
    return { kind: "unreachable" };
  }
  if (res.status === 200) return { kind: "writer", user: ((await res.json()) as { user: string }).user };
  if (res.status === 403) return { kind: "unregistered", clerkUserId: ((await res.json()) as { clerkUserId: string }).clerkUserId };
  if (res.status === 401) return { kind: "rejected" };
  return { kind: "unreachable" };
}

// The few parts of clerk-js this page uses.
export type Clerk = {
  load(options: { ui: { ClerkUI: unknown } }): Promise<void>;
  user: { id: string } | null | undefined;
  session: { getToken(): Promise<string | null> } | null | undefined;
  openSignIn(options?: Record<string, unknown>): void;
  mountUserButton(el: HTMLDivElement): void;
  addListener(fn: (state: { user?: unknown }) => void): () => void;
};

function script(src: string, attrs: Record<string, string> = {}) {
  return new Promise<void>((resolve, reject) => {
    const el = document.createElement("script");
    el.src = src;
    el.async = true;
    el.crossOrigin = "anonymous";
    for (const [k, v] of Object.entries(attrs)) el.setAttribute(k, v);
    el.onload = () => resolve();
    el.onerror = () => reject(new Error(`could not load ${src}`));
    document.head.appendChild(el);
  });
}

// Follows the <script> route of Clerk's JavaScript quickstart: the UI bundle,
// then clerk-js with the publishable key, which leaves an instance on window.
export async function loadClerk(publishableKey: string): Promise<Clerk> {
  const host = clerkFrontendApi(publishableKey);
  if (!host) throw new Error("not a Clerk publishable key");
  await script(`https://${host}/npm/@clerk/ui@1/dist/ui.browser.js`);
  await script(`https://${host}/npm/@clerk/clerk-js@6/dist/clerk.browser.js`, { "data-clerk-publishable-key": publishableKey });
  const w = window as unknown as { Clerk: Clerk; __internal_ClerkUICtor: unknown };
  await w.Clerk.load({ ui: { ClerkUI: w.__internal_ClerkUICtor } });
  return w.Clerk;
}

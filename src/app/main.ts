import "./app.css";
import type { Achievement, Catalogue } from "../shared/catalogue";
import type { LngLat } from "../shared/geo";
import type { MapView } from "./map";
import { openStore, type Store, type Unlock } from "./store";
import { createSyncer } from "./syncer";
import { loadClerk, userMenuItems, whoAmI, writesHere, type Clerk } from "./auth";
import { creditText, crumbs, formatDistance, headerLine, listView, shownAchievements, unlockedOnlyControl, type ListItem } from "./view";
import { REGIONS, isPast, regionById, route } from "../shared/regions";
import { tripSummaries } from "./trips";
import { gyazoImage, gyazoPage, photosByAchievement, type Photo } from "./photos";
import { loadPrefs, savePrefs, setStars, toggleCollapsed, type Prefs } from "./prefs";

const KIND_LABEL = { visit: "行く", eat: "食べる", ride: "乗る", see: "見る", do: "する" } as const;

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;

// A one-time setup link (#token=...&user=...) stores the writer's
// credentials on this device only. The token never appears in the page.
function readCredentials() {
  const hash = new URLSearchParams(location.hash.slice(1));
  if (hash.get("token") && hash.get("user")) {
    localStorage.setItem("token", hash.get("token")!);
    localStorage.setItem("user", hash.get("user")!);
    history.replaceState(null, "", location.pathname);
  }
  return { token: localStorage.getItem("token"), user: localStorage.getItem("user") };
}

// The trip comes from the path (/japan/kansai/osaka/); "/" lists the trips.
// /u/<id>/... is somebody's public, read-only record.
const where = route(location.pathname);
const publicUser = where.kind === "unknown" ? null : where.publicUser;
const home = publicUser ? `/u/${publicUser}/` : "/";

let catalogue: Catalogue;
let store: Store;
let unlocks: Unlock[] = [];
let photos = new Map<string, string[]>();
// A trip that is over opens on what was unlocked; the rest is one tick away.
// The tick is remembered per trip on this device.
let lookingBack = false;
let showLocked = true;
// The choice is remembered per trip on this device. It was stored inverted
// ("showLocked") before the box was turned into 解除済みの実績のみ表示.
const onlyKey = () => `unlockedOnly:${catalogue.region}`;
function readUnlockedOnly(): boolean | null {
  try {
    const v = localStorage.getItem(onlyKey());
    if (v !== null) return v === "1";
    const old = localStorage.getItem(`showLocked:${catalogue.region}`);
    return old === null ? null : old !== "1";
  } catch {
    return null;
  }
}

function applyUnlockedOnly() {
  const hasRecord = !!publicUser || canWrite;
  const c = unlockedOnlyControl({ lookingBack, hasRecord, stored: readUnlockedOnly() });
  const box = $<HTMLInputElement>("unlocked-only");
  box.closest("label")!.hidden = !c.shown;
  box.disabled = !c.enabled;
  box.checked = c.checked;
  showLocked = !c.checked;
}
let here: LngLat | null = null;
let mapView: MapView | null = null;
let prefs: Prefs = { stars: {}, collapsed: [], starTimes: {}, starPending: [] };
const { token, user } = readCredentials();
let clerk: Clerk | null = null;
// Set once the server has said this Clerk account may write, so the device
// keeps unlocking offline, when Clerk itself cannot load.
const CLERK_WRITER = "clerkWriter";
const clerkWriter = () => localStorage.getItem(CLERK_WRITER);
const writerName = () => (token ? user : clerkWriter());
let canWrite = writesHere(publicUser, writerName());

async function currentToken(): Promise<string | null> {
  if (token) return token;
  return (await clerk?.session?.getToken()) ?? null;
}

function toast(text: string) {
  const el = $("toast");
  el.textContent = text;
  el.hidden = false;
  clearTimeout((toast as unknown as { t?: number }).t);
  (toast as unknown as { t?: number }).t = window.setTimeout(() => (el.hidden = true), 3500);
}

function time(iso: string) {
  return new Date(iso).toLocaleString("ja-JP", { month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit" });
}

function render() {
  if (!catalogue) return; // the trips page draws itself
  const view = listView(catalogue.achievements, unlocks, here, catalogue.categories, prefs.stars, { lookingBack, showLocked });
  const p = view.progress;
  $("progress").textContent =
    headerLine({ whose: publicUser, unlocked: p.unlocked, total: p.total, pending: p.pending });
  const list = $("list");
  const itemLi = ({ achievement: a, unlocked, unlockedAt, meters, stars }: ListItem) => {
      const li = document.createElement("li");
      li.className = unlocked ? "item unlocked" : "item";
      // The person's own photo, when there is one, stands in for the stock one.
      const own = photos.get(a.id);
      const img = own
        ? `<a class="own" href="${gyazoPage(own[0])}" target="_blank" rel="noopener"><img src="${gyazoImage(own[0], 200)}" alt="" loading="lazy" width="72" height="72"></a>`
        : a.image
          ? `<img src="${a.image.url}" alt="" loading="lazy" width="72" height="72">`
          : `<div class="noimg">${KIND_LABEL[a.kind]}</div>`;
      const credit = own
        ? `<a class="credit" href="${gyazoPage(own[0])}" target="_blank" rel="noopener">📷 ${escape(photoOwner() ?? "")}の写真${own.length > 1 ? ` ほか ${own.length - 1} 枚` : ""} (Gyazo)</a>`
        : a.image
          ? `<a class="credit" href="${a.image.page}" target="_blank" rel="noopener">${escape(creditText(a.image))}</a>`
          : "";
      const action = unlocked
        ? `<span class="done">🏆 ${time(unlockedAt!)}</span>`
        : canWrite
          ? `<button class="unlock" data-id="${a.id}">解除！</button>`
          : "";
      const starButtons = [1, 2, 3, 4, 5]
        .map((n) => `<button class="star" data-id="${a.id}" data-stars="${n}" aria-label="優先度 ${n}" aria-pressed="${n <= stars}">${n <= stars ? "★" : "☆"}</button>`)
        .join("");
      li.innerHTML = `${img}<div class="body"><div class="title">${escape(a.title)}</div>
        <div class="stars" role="group" aria-label="${escape(a.title)}の優先度">${starButtons}</div>
        <div class="meta">${KIND_LABEL[a.kind]} ・ ${escape(a.place)}${meters !== null ? ` ・ ${formatDistance(meters)}` : ""}</div>${credit}</div>${action}`;
      return li;
  };
  list.replaceChildren(
    ...view.groups.flatMap((g) => {
      const collapsed = prefs.collapsed.includes(g.category);
      const head = document.createElement("li");
      head.className = "group";
      head.innerHTML = `<button class="fold" data-cat="${g.category}" aria-expanded="${!collapsed}"><span class="chev">${collapsed ? "▸" : "▾"}</span><h2>${escape(g.label)}</h2></button>
        <span class="count">${g.unlocked} / ${g.total}</span>`;
      return collapsed ? [head] : [head, ...g.items.map(itemLi)];
    }),
  );
  if (!view.groups.length) {
    const li = document.createElement("li");
    li.className = "empty";
    li.textContent = "この旅で解除した実績は、まだありません。「解除済みの実績のみ表示」を外すと全部を見られます。";
    list.replaceChildren(li);
  }
  $("sync-status").textContent = syncText();
  mapView?.update();
}

function updatePrefs(next: Prefs) {
  prefs = next;
  savePrefs(localStorage, catalogue.region, prefs);
  render();
}

function escape(s: string) {
  return s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);
}

async function unlock(id: string) {
  const a = catalogue.achievements.find((x) => x.id === id);
  if (!a || !confirm(`「${a.title}」を解除しますか？`)) return;
  await store.unlock(id, new Date().toISOString());
  unlocks = await store.all();
  toast(`🏆 実績解除！ ${a.title}`);
  render();
  mapView?.flyTo(a.lngLat);
  void trySync();
}

let syncer: ReturnType<typeof createSyncer>;
// The trips page has no syncer: it only reads.
const trySync = () => syncer?.trySync() ?? Promise.resolve();

function syncText(): string {
  const st = syncer?.status();
  if (!canWrite || publicUser || !st) return "";
  if (st.ok) return `同期済み ${time(st.at)}`;
  if (st.error === "no token") return "同期: ログインの確認を待っています";
  return `同期できませんでした (${st.error})。未送信の記録は端末に残っています`;
}

function geojson() {
  const done = new Set(unlocks.map((u) => u.achievementId));
  return {
    type: "FeatureCollection" as const,
    features: shownAchievements(catalogue.achievements, unlocks, { lookingBack, showLocked }).map((a: Achievement) => ({
      type: "Feature" as const,
      geometry: { type: "Point" as const, coordinates: a.lngLat },
      properties: { id: a.id, title: a.title, unlocked: done.has(a.id) },
    })),
  };
}

async function openMap() {
  if (mapView) return;
  const { createMap } = await import("./map");
  mapView = await createMap({
    container: "map",
    bbox: catalogue.bbox,
    achievements: geojson,
    canWrite: () => canWrite,
    toast,
  });
}

function showTab(which: "list" | "map") {
  $("tab-list").setAttribute("aria-pressed", String(which === "list"));
  $("tab-map").setAttribute("aria-pressed", String(which === "map"));
  $("list").hidden = which !== "list";
  $("map").hidden = which !== "map";
  if (which === "map") void openMap().then(() => mapView?.resize());
}

let watching = false;
function watchLocation() {
  if (watching || !("geolocation" in navigator)) return;
  watching = true;
  navigator.geolocation.watchPosition(
    (pos) => {
      here = [pos.coords.longitude, pos.coords.latitude];
      render();
    },
    () => {},
    { enableHighAccuracy: true, maximumAge: 30_000 },
  );
}

// Whose photos to show: the public page's person, or the writer.
const photoOwner = () => publicUser ?? (canWrite ? writerName() : null);

async function loadPhotos() {
  const who = photoOwner();
  if (!who) return;
  const res = await fetch(`/api/users/${who}/photos`).catch(() => null);
  if (!res?.ok) return;
  photos = photosByAchievement(((await res.json()) as { photos: Photo[] }).photos);
  render();
}

async function showTrips() {
  document.querySelector("nav")?.remove();
  store = await openStore(publicUser ? `public-${publicUser}` : "unlock-your-trip");
  // A writer's own unlocks are public too, so the top page can count every
  // device's unlocks without signing in first.
  const whose = publicUser ?? (canWrite ? writerName() : null);
  if (whose) {
    const res = await fetch(`/api/users/${whose}/unlocks`).catch(() => null);
    if (res?.ok) await store.mergeRemote(((await res.json()) as { unlocks: Unlock[] }).unlocks);
  }
  const done = new Set((await store.all()).map((u) => u.achievementId));
  const catalogues = await Promise.all(
    REGIONS.map((r) =>
      fetch(`/catalogues/${r.id}.json`)
        .then((res) => (res.ok ? (res.json() as Promise<Catalogue>) : null))
        .catch(() => null),
    ),
  );
  const ids = (id: string) => catalogues.find((c) => c?.region === id)?.achievements.map((a) => a.id) ?? null;
  const trips = tripSummaries(REGIONS, ids, done, publicUser);
  $("progress").textContent = headerLine({ whose: publicUser, trips: trips.length });
  const list = $("list");
  list.className = "trips";
  list.replaceChildren(
    ...trips.map((t) => {
      const li = document.createElement("li");
      li.className = "trip";
      const count = t.total === null ? "" : `<span class="count">✅ ${t.unlocked} / 目標 ${t.total} 実績</span>`;
      li.innerHTML = `<a href="${t.href}"><div class="mini-wrap"><div class="mini" data-region="${t.id}"></div><span class="attr">© OpenFreeMap © OpenMapTiles © OpenStreetMap contributors</span></div>
        <div class="info"><span class="name">${escape(t.name)}</span><span class="year">${t.year}</span>${count}</div></a>`;
      return li;
    }),
  );
  showAccountSlot();
  // Each card's map is drawn when the card comes into view; the map library
  // is loaded only then, as on a trip's map tab.
  const byId = new Map(catalogues.filter((c): c is Catalogue => !!c).map((c) => [c.region, c]));
  const seen = new IntersectionObserver((entries) => {
    for (const e of entries) {
      if (!e.isIntersecting) continue;
      seen.unobserve(e.target);
      const c = byId.get((e.target as HTMLElement).dataset.region!);
      if (c) void import("./map").then(({ createMiniMap }) => createMiniMap(e.target as HTMLElement, c, done));
    }
  });
  list.querySelectorAll<HTMLElement>(".mini").forEach((el) => seen.observe(el));
  if ("serviceWorker" in navigator && import.meta.env.PROD) void navigator.serviceWorker.register("/sw.js");
}

async function main() {
  $("crumbs").replaceChildren(
    ...crumbs(publicUser).map(({ label, href }) => {
      const a = document.createElement("a");
      a.href = href;
      a.textContent = label;
      return a;
    }),
  );
  if (where.kind === "trips") return showTrips();
  if (where.kind !== "region") {
    document.querySelector("nav")?.remove();
    $("progress").textContent = publicUser ? `${publicUser} さんの旅` : "旅";
    const li = document.createElement("li");
    li.className = "empty";
    li.innerHTML = `この旅は、まだ一覧にありません。<a href="${home}">旅の一覧</a>から選んでください。`;
    $("list").replaceChildren(li);
    showAccountSlot();
    return;
  }
  catalogue = await (await fetch(`/catalogues/${where.region}.json`)).json();
  $("region").textContent = catalogue.name;
  $("credits").innerHTML =
    '地図: <a href="https://openfreemap.org/" target="_blank" rel="noopener">OpenFreeMap</a> © OpenMapTiles © <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener">OpenStreetMap contributors</a>' +
    ' ・ 実績の場所: <a href="https://www.wikidata.org/" target="_blank" rel="noopener">Wikidata</a>、OpenStreetMap ・ 写真: Wikimedia Commons (各写真の作者とライセンスは写真の下)';
  store = await openStore(publicUser ? `public-${publicUser}` : "unlock-your-trip");
  if (publicUser) {
    const res = await fetch(`/api/users/${publicUser}/unlocks`);
    if (res.ok) await store.mergeRemote(((await res.json()) as { unlocks: Unlock[] }).unlocks);
  }
  unlocks = await store.all();
  void loadPhotos();
  prefs = loadPrefs(localStorage, catalogue.region);
  const region = regionById(catalogue.region);
  lookingBack = !!region && isPast(region);
  applyUnlockedOnly();
  $<HTMLInputElement>("unlocked-only").addEventListener("change", (ev) => {
    const on = (ev.target as HTMLInputElement).checked;
    showLocked = !on;
    try {
      localStorage.setItem(onlyKey(), on ? "1" : "0");
    } catch {
      // the choice then lasts only for this visit
    }
    render();
    mapView?.fit();
  });
  syncer = createSyncer({
    canWrite: () => canWrite,
    getToken: currentToken,
    store,
    getPrefs: () => prefs,
    setPrefs: (p) => {
      prefs = p;
      savePrefs(localStorage, catalogue.region, prefs);
    },
    knownIds: () => new Set(catalogue.achievements.map((a) => a.id)),
    onChange: async () => {
      unlocks = await store.all();
      render();
    },
  });
  render();
  document.addEventListener("click", (ev) => {
    const t = ev.target as HTMLElement;
    const b = t.closest<HTMLButtonElement>("button.unlock");
    if (b?.dataset.id) void unlock(b.dataset.id);
    const star = t.closest<HTMLButtonElement>("button.star");
    if (star?.dataset.id) {
      updatePrefs(setStars(prefs, star.dataset.id, Number(star.dataset.stars)));
      void trySync();
    }
    const fold = t.closest<HTMLButtonElement>("button.fold");
    if (fold?.dataset.cat) updatePrefs(toggleCollapsed(prefs, fold.dataset.cat));
  });
  $("tab-list").addEventListener("click", () => showTab("list"));
  $("tab-map").addEventListener("click", () => showTab("map"));
  // Only the person unlocking needs "near me". Viewers of a public page
  // are never asked for their position.
  if (canWrite) watchLocation();
  window.addEventListener("online", () => void trySync());
  // Coming back to the app (switching from another device) picks up changes.
  document.addEventListener("visibilitychange", () => document.visibilityState === "visible" && void trySync());
  setInterval(() => void trySync(), 60_000);
  void trySync();
  if ("serviceWorker" in navigator && import.meta.env.PROD) void navigator.serviceWorker.register("/sw.js");
  showWriter();
  showAccountSlot();
}

function showWriter() {
  const name = writerName();
  $("progress").title = name && !publicUser ? `記録先: ${name}` : "";
}

function note(text: string | null) {
  const el = $("account-note");
  el.textContent = text ?? "";
  el.hidden = !text;
}

function setWriter(name: string | null) {
  if (name) localStorage.setItem(CLERK_WRITER, name);
  else localStorage.removeItem(CLERK_WRITER);
  const was = canWrite;
  canWrite = writesHere(publicUser, writerName());
  showWriter();
  if (canWrite && !was && catalogue) {
    watchLocation();
    void trySync();
  }
  if (canWrite !== was && catalogue) {
    applyUnlockedOnly();
    render();
    mapView?.fit();
  }
}

// The right end of the header, the same on every page: Clerk's sign-in
// button or user button (whose menu has 自分の実績). A device on a setup link
// has no Clerk, so the slot holds a button of the same look leading there.
function showAccountSlot() {
  if (!token) {
    void setupClerk();
    return;
  }
  const name = writerName();
  if (!name) return;
  const a = document.createElement("a");
  a.className = "signin";
  a.href = `/u/${name}/`;
  a.textContent = "自分の実績";
  $("account").replaceChildren(a);
}

// A device with a setup link never needs Clerk. Every other writer's page
// signs in with Clerk; failing to load it (offline) changes nothing.
async function setupClerk() {
  try {
    const { clerkPublishableKey } = (await (await fetch("/api/config")).json()) as { clerkPublishableKey?: string };
    if (!clerkPublishableKey) return;
    clerk = await loadClerk(clerkPublishableKey);
  } catch {
    return;
  }
  clerk.addListener(() => void showAccount());
  await showAccount();
  // The sync at start ran before Clerk had a token; run it now that it does.
  void trySync();
}

function mountUserButton(box: HTMLDivElement, writer: string | null) {
  clerk?.unmountUserButton(box);
  clerk?.mountUserButton(box, {
    customMenuItems: userMenuItems(writer).map((item) => ({
      ...item,
      mountIcon: (el: HTMLDivElement) => (el.textContent = "🏆"),
      unmountIcon: () => {},
    })),
  });
}

let shownUser: string | null | undefined;
async function showAccount() {
  if (!clerk) return;
  const id = clerk.user?.id ?? null;
  if (id === shownUser) return;
  shownUser = id;
  const box = $<HTMLDivElement>("account");
  box.replaceChildren();
  if (!id) {
    note(null);
    setWriter(null);
    const b = document.createElement("button");
    b.className = "signin";
    b.textContent = "ログイン";
    b.addEventListener("click", () => clerk?.openSignIn());
    // replaceChildren, not append: the Workers types redefine Element.append.
    box.replaceChildren(b);
    return;
  }
  // Mount with what this device already knows, so the button shows at once;
  // remount once the server names the writer if that changes the menu.
  let mountedFor = writerName();
  mountUserButton(box, mountedFor);
  const t = await currentToken();
  const me = t ? await whoAmI(t) : { kind: "rejected" as const };
  if (me.kind === "writer") {
    note(null);
    setWriter(me.user);
    if (mountedFor !== me.user) mountUserButton(box, (mountedFor = me.user));
  } else if (me.kind === "unregistered") {
    setWriter(null);
    note(`このアカウントは、まだ記録先に登録されていません。管理者に次の ID を伝えてください: ${me.clerkUserId}`);
  } else if (me.kind === "rejected") {
    setWriter(null);
    note("ログインを確かめられませんでした。ログインし直してください。");
  }
  // "unreachable": keep whatever this device already knew.
}

void main();

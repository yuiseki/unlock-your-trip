import type * as maplibregl from "maplibre-gl";
import { Map as MapLibreMap, NavigationControl, Popup, setWorkerUrl, type GeoJSONSource, type IControl } from "maplibre-gl";
import workerUrl from "maplibre-gl/dist/maplibre-gl-worker.mjs?worker&url";
import "maplibre-gl/dist/maplibre-gl.css";
import "./app.css";
import type { Achievement, Catalogue } from "../shared/catalogue";
import type { LngLat } from "../shared/geo";
import { openStore, type Store, type Unlock } from "./store";
import { japaneseLabels } from "./style";
import { sync } from "./sync";
import { creditText, formatDistance, listView } from "./view";

setWorkerUrl(workerUrl);

const STYLE_URL = "https://tiles.openfreemap.org/styles/liberty";
const REGION = "osaka";
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

// /u/<id> is somebody's public, read-only page.
const publicUser = /^\/u\/([a-z0-9-]{1,40})\/?$/.exec(location.pathname)?.[1] ?? null;

let catalogue: Catalogue;
let store: Store;
let unlocks: Unlock[] = [];
let here: LngLat | null = null;
let map: MapLibreMap | null = null;
const { token, user } = readCredentials();
const canWrite = !publicUser && !!token;

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
  const view = listView(catalogue.achievements, unlocks, here);
  const p = view.progress;
  $("progress").textContent =
    `${p.unlocked} / ${p.total} 解除` + (p.pending ? `(未送信 ${p.pending})` : "") + (publicUser ? ` ・ ${publicUser} さんの記録` : "");
  const list = $("list");
  list.replaceChildren(
    ...view.items.map(({ achievement: a, unlocked, unlockedAt, meters }) => {
      const li = document.createElement("li");
      li.className = unlocked ? "item unlocked" : "item";
      const img = a.image ? `<img src="${a.image.url}" alt="" loading="lazy" width="72" height="72">` : `<div class="noimg">${KIND_LABEL[a.kind]}</div>`;
      const credit = a.image
        ? `<a class="credit" href="${a.image.page}" target="_blank" rel="noopener">${escape(creditText(a.image))}</a>`
        : "";
      const action = unlocked
        ? `<span class="done">🏆 ${time(unlockedAt!)}</span>`
        : canWrite
          ? `<button class="unlock" data-id="${a.id}">解除！</button>`
          : "";
      li.innerHTML = `${img}<div class="body"><div class="title">${escape(a.title)}</div>
        <div class="meta">${KIND_LABEL[a.kind]} ・ ${escape(a.place)}${meters !== null ? ` ・ ${formatDistance(meters)}` : ""}</div>${credit}</div>${action}`;
      return li;
    }),
  );
  updateMap();
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
  if (map) map.flyTo({ center: a.lngLat, zoom: 16 });
  void trySync();
}

async function trySync() {
  if (!canWrite) return;
  const r = await sync(store, { token });
  if (r.ok) {
    unlocks = await store.all();
    render();
  }
}

function geojson() {
  const done = new Set(unlocks.map((u) => u.achievementId));
  return {
    type: "FeatureCollection" as const,
    features: catalogue.achievements.map((a: Achievement) => ({
      type: "Feature" as const,
      geometry: { type: "Point" as const, coordinates: a.lngLat },
      properties: { id: a.id, title: a.title, unlocked: done.has(a.id) },
    })),
  };
}

function hereGeojson() {
  return { type: "FeatureCollection" as const, features: here ? [{ type: "Feature" as const, geometry: { type: "Point" as const, coordinates: here }, properties: {} }] : [] };
}

function updateMap() {
  (map?.getSource("achievements") as GeoJSONSource | undefined)?.setData(geojson());
  (map?.getSource("here") as GeoJSONSource | undefined)?.setData(hereGeojson());
}

// The device position comes from the one watchPosition the list already
// uses, so the list and the map always agree on where "here" is.
class LocateButton implements IControl {
  private el = document.createElement("div");
  onAdd() {
    this.el.className = "maplibregl-ctrl maplibregl-ctrl-group";
    this.el.innerHTML = '<button type="button" class="locate" title="現在地へ" aria-label="現在地へ">📍</button>';
    this.el.querySelector("button")!.addEventListener("click", () => {
      if (here) map?.flyTo({ center: here, zoom: 15 });
      else toast("現在地がまだ分かりません");
    });
    return this.el;
  }
  onRemove() {
    this.el.remove();
  }
}

async function openMap() {
  if (map) return;
  const style = japaneseLabels((await (await fetch(STYLE_URL)).json()) as maplibregl.StyleSpecification & { layers: any[] });
  const [w, s, e, n] = catalogue.bbox;
  map = here ? new MapLibreMap({ container: "map", style, center: here, zoom: 14 }) : new MapLibreMap({ container: "map", style, bounds: [w, s, e, n] });
  map.addControl(new NavigationControl(), "top-right");
  map.addControl(new LocateButton(), "top-right");
  map.on("load", () => {
    map!.addSource("achievements", { type: "geojson", data: geojson() });
    map!.addLayer({
      id: "achievements",
      type: "circle",
      source: "achievements",
      paint: {
        "circle-radius": 9,
        "circle-color": ["case", ["get", "unlocked"], "#9ca3af", "#d97706"],
        "circle-stroke-width": 2,
        "circle-stroke-color": "#ffffff",
      },
    });
    map!.addLayer({
      id: "achievement-labels",
      type: "symbol",
      source: "achievements",
      layout: { "text-field": ["get", "title"], "text-size": 12, "text-offset": [0, 1.2], "text-anchor": "top", "text-max-width": 10 },
      paint: { "text-color": "#7c2d12", "text-halo-color": "#ffffff", "text-halo-width": 1.5 },
    });
    map!.addSource("here", { type: "geojson", data: hereGeojson() });
    map!.addLayer({
      id: "here",
      type: "circle",
      source: "here",
      paint: { "circle-radius": 8, "circle-color": "#2563eb", "circle-stroke-width": 3, "circle-stroke-color": "#ffffff" },
    });
  });
  map.on("click", "achievements", (ev) => {
    const f = ev.features?.[0];
    if (!f) return;
    const { id, title, unlocked } = f.properties as { id: string; title: string; unlocked: boolean };
    const html = `<strong>${escape(title)}</strong><br>` + (unlocked ? "🏆 解除済み" : canWrite ? `<button class="unlock" data-id="${id}">解除！</button>` : "");
    new Popup().setLngLat((f.geometry as { coordinates: [number, number] }).coordinates).setHTML(html).addTo(map!);
  });
  map.on("mouseenter", "achievements", () => (map!.getCanvas().style.cursor = "pointer"));
  map.on("mouseleave", "achievements", () => (map!.getCanvas().style.cursor = ""));
}

function showTab(which: "list" | "map") {
  $("tab-list").setAttribute("aria-pressed", String(which === "list"));
  $("tab-map").setAttribute("aria-pressed", String(which === "map"));
  $("list").hidden = which !== "list";
  $("map").hidden = which !== "map";
  if (which === "map") void openMap().then(() => map?.resize());
}

function watchLocation() {
  if (!("geolocation" in navigator)) return;
  navigator.geolocation.watchPosition(
    (pos) => {
      here = [pos.coords.longitude, pos.coords.latitude];
      render();
    },
    () => {},
    { enableHighAccuracy: true, maximumAge: 30_000 },
  );
}

async function main() {
  catalogue = await (await fetch(`/catalogues/${REGION}.json`)).json();
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
  render();
  document.addEventListener("click", (ev) => {
    const b = (ev.target as HTMLElement).closest<HTMLButtonElement>("button.unlock");
    if (b?.dataset.id) void unlock(b.dataset.id);
  });
  $("tab-list").addEventListener("click", () => showTab("list"));
  $("tab-map").addEventListener("click", () => showTab("map"));
  watchLocation();
  window.addEventListener("online", () => void trySync());
  setInterval(() => void trySync(), 60_000);
  void trySync();
  if ("serviceWorker" in navigator && import.meta.env.PROD) void navigator.serviceWorker.register("/sw.js");
  if (user && !publicUser) $("progress").title = `記録先: ${user}`;
}

void main();

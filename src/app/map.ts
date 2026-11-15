// Loaded only when the map tab is opened, so the list starts without
// downloading the map library.
import { GeolocateControl, Map as MapLibreMap, Marker, NavigationControl, Popup, setWorkerUrl, type GeoJSONSource, type StyleSpecification } from "maplibre-gl";
import workerUrl from "maplibre-gl/dist/maplibre-gl-worker.mjs?worker&url";
import "maplibre-gl/dist/maplibre-gl.css";
import type { FeatureCollection, Point } from "geojson";
import type { Catalogue } from "../shared/catalogue";
import { boundsOf, type LngLat } from "../shared/geo";
import { japaneseLabels } from "./style";
import { gyazoImage, photoMarkers } from "./photos";
import { starsHtml } from "./stars";

setWorkerUrl(workerUrl);

const STYLE_URL = "https://tiles.openfreemap.org/styles/liberty";

export type MapView = { update(): void; fit(): void; flyTo(lngLat: LngLat): void; resize(): void };

type Context = {
  container: string;
  bbox: [number, number, number, number];
  achievements: () => FeatureCollection;
  canWrite: () => boolean;
  stars: (id: string) => number;
  toast: (text: string) => void;
  photos: () => Map<string, string[]>;
};

const escape = (s: string) => s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);

// One fetch of the style for every map on the page (the trips page has one per card).
let styleOnce: Promise<StyleSpecification> | null = null;
const loadStyle = () =>
  (styleOnce ??= fetch(STYLE_URL)
    .then((r) => r.json())
    .then((s) => japaneseLabels(s as StyleSpecification)));

const UNLOCKED = "#16a34a"; // green
const TO_DO = "#d97706"; // amber

// A trip's card on the top page: its achievements on a map that only shows,
// so a tap anywhere on the card opens the trip.
export async function createMiniMap(container: HTMLElement, c: Catalogue, done: Set<string>): Promise<void> {
  const pts = c.achievements.map((a) => a.lngLat);
  const map = new MapLibreMap({
    container,
    style: await loadStyle(),
    bounds: boundsOf(pts, null) ?? c.bbox,
    // Room around the points, so the ones at the edge are not cut by the card.
    fitBoundsOptions: { padding: { top: 28, bottom: 28, left: 36, right: 36 }, maxZoom: 15 },
    interactive: false,
    // MapLibre's attribution opens over a small map and, with no interaction,
    // can never be closed; the card prints the same credit in its corner.
    attributionControl: false,
  });
  map.on("load", () => {
    map.addSource("achievements", {
      type: "geojson",
      data: {
        type: "FeatureCollection",
        features: c.achievements.map((a) => ({ type: "Feature", geometry: { type: "Point", coordinates: a.lngLat }, properties: { unlocked: done.has(a.id) } })),
      },
    });
    map.addLayer({
      id: "achievements",
      type: "circle",
      source: "achievements",
      paint: { "circle-radius": 4, "circle-color": ["case", ["get", "unlocked"], UNLOCKED, TO_DO], "circle-stroke-width": 1, "circle-stroke-color": "#ffffff" },
    });
  });
}

export async function createMap(ctx: Context): Promise<MapView> {
  const style = await loadStyle();
  const points = () => ctx.achievements().features.map((f) => (f.geometry as Point).coordinates as LngLat);
  const PADDING = { top: 60, bottom: 60, left: 40, right: 60 };
  const map = new MapLibreMap({
    container: ctx.container,
    style,
    // The trip's achievements only. Looking back at a past trip from home,
    // the device's position would only zoom the map out; the geolocate
    // control brings it in when wanted.
    bounds: boundsOf(points(), null) ?? ctx.bbox,
    fitBoundsOptions: { padding: PADDING, maxZoom: 16 },
  });
  map.addControl(new NavigationControl(), "top-right");
  // MapLibre's own control: it asks for the position, follows it, and shows
  // its state by colour (searching, following, lost). Only writers get it;
  // viewers of a public page are never asked where they are.
  if (ctx.canWrite())
    map.addControl(
      new GeolocateControl({ positionOptions: { enableHighAccuracy: true }, trackUserLocation: true, showAccuracyCircle: true }),
      "top-right",
    );
  map.on("load", () => {
    map.addSource("achievements", { type: "geojson", data: ctx.achievements() });
    map.addLayer({
      id: "achievements",
      type: "circle",
      source: "achievements",
      // Achievements with the person's photo are drawn as that photo instead.
      filter: ["!", ["get", "hasPhoto"]],
      paint: {
        "circle-radius": 9,
        "circle-color": ["case", ["get", "unlocked"], UNLOCKED, TO_DO],
        "circle-stroke-width": 2,
        "circle-stroke-color": "#ffffff",
      },
    });
    map.addLayer({
      id: "achievement-labels",
      type: "symbol",
      source: "achievements",
      layout: {
        "text-field": ["get", "title"],
        "text-size": 12,
        // Below the photo marker (48 px) when there is one, below the dot otherwise.
        "text-offset": ["case", ["get", "hasPhoto"], ["literal", [0, 2.4]], ["literal", [0, 1.2]]],
        "text-anchor": "top",
        "text-max-width": 10,
      },
      paint: { "text-color": "#7c2d12", "text-halo-color": "#ffffff", "text-halo-width": 1.5 },
    });
  });
  let activePopup: Popup | null = null;
  const popup = (id: string, title: string, unlocked: boolean, at: [number, number]) => {
    activePopup?.remove();
    const html = `<strong>${escape(title)}</strong>${starsHtml(id, title, ctx.stars(id), ctx.canWrite())}` + (unlocked ? "🏆 解除済み" : ctx.canWrite() ? `<button class="unlock" data-id="${escape(id)}">解除！</button>` : "");
    activePopup = new Popup({ offset: 14 }).setLngLat(at).setHTML(html).addTo(map);
  };
  map.on("click", "achievements", (ev) => {
    const f = ev.features?.[0];
    if (!f) return;
    // maplibre-gl v6 returns feature properties as plain values.
    const { id, title, unlocked } = f.properties as { id: string; title: string; unlocked: boolean };
    popup(id, title, unlocked, (f.geometry as Point).coordinates as [number, number]);
  });

  // The person's photos as markers, like a Gyazo collection map: a framed
  // thumbnail, stacked when there are several, ✅ in the corner once unlocked.
  let markers: Marker[] = [];
  const drawPhotos = () => {
    for (const m of markers) m.remove();
    const features = ctx.achievements().features as unknown as Parameters<typeof photoMarkers>[0];
    markers = photoMarkers(features, ctx.photos()).map((p) => {
      const el = document.createElement("button");
      el.type = "button";
      el.className = `photo-marker${p.count > 1 ? " stack" : ""}`;
      el.setAttribute("aria-label", p.title);
      el.innerHTML = `<img src="${gyazoImage(p.photo, 200)}" alt="" loading="lazy">${p.unlocked ? '<span class="badge">✅</span>' : ""}`;
      el.addEventListener("click", (ev) => {
        ev.stopPropagation();
        popup(p.id, p.title, p.unlocked, p.lngLat);
      });
      return new Marker({ element: el }).setLngLat(p.lngLat).addTo(map);
    });
  };
  map.on("load", drawPhotos);
  map.on("mouseenter", "achievements", () => (map.getCanvas().style.cursor = "pointer"));
  map.on("mouseleave", "achievements", () => (map.getCanvas().style.cursor = ""));

  return {
    update() {
      (map.getSource("achievements") as GeoJSONSource | undefined)?.setData(ctx.achievements());
      activePopup?.getElement()?.querySelectorAll<HTMLButtonElement>("button.star").forEach((button) => {
        const selected = Number(button.dataset.stars) <= ctx.stars(button.dataset.id!);
        button.textContent = selected ? "★" : "☆";
        button.setAttribute("aria-pressed", String(selected));
        button.disabled = !ctx.canWrite();
      });
      if (map.loaded()) drawPhotos();
    },
    // Frame what is shown now, e.g. after the list switches between the
    // unlocked achievements only and all of them.
    fit() {
      const b = boundsOf(points(), null);
      if (b) map.fitBounds(b, { padding: PADDING, maxZoom: 16 });
    },
    flyTo: (lngLat) => map.flyTo({ center: lngLat, zoom: 16 }),
    resize: () => map.resize(),
  };
}

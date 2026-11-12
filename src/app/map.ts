// Loaded only when the map tab is opened, so the list starts without
// downloading the map library.
import { GeolocateControl, Map as MapLibreMap, NavigationControl, Popup, setWorkerUrl, type GeoJSONSource, type StyleSpecification } from "maplibre-gl";
import workerUrl from "maplibre-gl/dist/maplibre-gl-worker.mjs?worker&url";
import "maplibre-gl/dist/maplibre-gl.css";
import type { FeatureCollection, Point } from "geojson";
import { boundsOf, type LngLat } from "../shared/geo";
import { japaneseLabels } from "./style";

setWorkerUrl(workerUrl);

const STYLE_URL = "https://tiles.openfreemap.org/styles/liberty";

export type MapView = { update(): void; fit(): void; flyTo(lngLat: LngLat): void; resize(): void };

type Context = {
  container: string;
  bbox: [number, number, number, number];
  achievements: () => FeatureCollection;
  canWrite: () => boolean;
  toast: (text: string) => void;
};

const escape = (s: string) => s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);

export async function createMap(ctx: Context): Promise<MapView> {
  const style = japaneseLabels((await (await fetch(STYLE_URL)).json()) as StyleSpecification);
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
      paint: {
        "circle-radius": 9,
        "circle-color": ["case", ["get", "unlocked"], "#16a34a", "#d97706"], // unlocked: green, still to do: amber
        "circle-stroke-width": 2,
        "circle-stroke-color": "#ffffff",
      },
    });
    map.addLayer({
      id: "achievement-labels",
      type: "symbol",
      source: "achievements",
      layout: { "text-field": ["get", "title"], "text-size": 12, "text-offset": [0, 1.2], "text-anchor": "top", "text-max-width": 10 },
      paint: { "text-color": "#7c2d12", "text-halo-color": "#ffffff", "text-halo-width": 1.5 },
    });
  });
  map.on("click", "achievements", (ev) => {
    const f = ev.features?.[0];
    if (!f) return;
    // maplibre-gl v6 returns feature properties as plain values.
    const { id, title, unlocked } = f.properties as { id: string; title: string; unlocked: boolean };
    const html = `<strong>${escape(title)}</strong><br>` + (unlocked ? "🏆 解除済み" : ctx.canWrite() ? `<button class="unlock" data-id="${id}">解除！</button>` : "");
    new Popup().setLngLat((f.geometry as Point).coordinates as [number, number]).setHTML(html).addTo(map);
  });
  map.on("mouseenter", "achievements", () => (map.getCanvas().style.cursor = "pointer"));
  map.on("mouseleave", "achievements", () => (map.getCanvas().style.cursor = ""));

  return {
    update() {
      (map.getSource("achievements") as GeoJSONSource | undefined)?.setData(ctx.achievements());
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

// Loaded only when the map tab is opened, so the list starts without
// downloading the map library.
import { Map as MapLibreMap, NavigationControl, Popup, setWorkerUrl, type GeoJSONSource, type IControl, type StyleSpecification } from "maplibre-gl";
import workerUrl from "maplibre-gl/dist/maplibre-gl-worker.mjs?worker&url";
import "maplibre-gl/dist/maplibre-gl.css";
import type { FeatureCollection, Point } from "geojson";
import { boundsOf, type LngLat } from "../shared/geo";
import { japaneseLabels } from "./style";

setWorkerUrl(workerUrl);

const STYLE_URL = "https://tiles.openfreemap.org/styles/liberty";

export type MapView = { update(): void; flyTo(lngLat: LngLat): void; resize(): void };

type Context = {
  container: string;
  bbox: [number, number, number, number];
  here: () => LngLat | null;
  achievements: () => FeatureCollection;
  canWrite: boolean;
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
    bounds: boundsOf(points(), ctx.here()) ?? ctx.bbox,
    fitBoundsOptions: { padding: PADDING, maxZoom: 16 },
  });
  // If the position arrives after the map opened, widen the view once to
  // include it, unless the person has already moved the map.
  let fittedWithHere = ctx.here() !== null;
  let moved = false;
  map.on("dragstart", () => (moved = true));
  map.on("zoomstart", (e) => { if ((e as { originalEvent?: Event }).originalEvent) moved = true; });

  const hereData = (): FeatureCollection => {
    const h = ctx.here();
    return { type: "FeatureCollection", features: h ? [{ type: "Feature", geometry: { type: "Point", coordinates: h }, properties: {} }] : [] };
  };

  // The device position comes from the one watchPosition the list already
  // uses, so the list and the map always agree on where "here" is.
  class LocateButton implements IControl {
    private el = document.createElement("div");
    onAdd() {
      this.el.className = "maplibregl-ctrl maplibregl-ctrl-group";
      this.el.innerHTML = '<button type="button" class="locate" title="現在地へ" aria-label="現在地へ">📍</button>';
      this.el.querySelector("button")!.addEventListener("click", () => {
        const h = ctx.here();
        if (h) map.flyTo({ center: h, zoom: 15 });
        else ctx.toast("現在地がまだ分かりません");
      });
      return this.el;
    }
    onRemove() {
      this.el.remove();
    }
  }

  map.addControl(new NavigationControl(), "top-right");
  if (ctx.canWrite) map.addControl(new LocateButton(), "top-right");
  map.on("load", () => {
    map.addSource("achievements", { type: "geojson", data: ctx.achievements() });
    map.addLayer({
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
    map.addLayer({
      id: "achievement-labels",
      type: "symbol",
      source: "achievements",
      layout: { "text-field": ["get", "title"], "text-size": 12, "text-offset": [0, 1.2], "text-anchor": "top", "text-max-width": 10 },
      paint: { "text-color": "#7c2d12", "text-halo-color": "#ffffff", "text-halo-width": 1.5 },
    });
    map.addSource("here", { type: "geojson", data: hereData() });
    map.addLayer({
      id: "here",
      type: "circle",
      source: "here",
      paint: { "circle-radius": 8, "circle-color": "#2563eb", "circle-stroke-width": 3, "circle-stroke-color": "#ffffff" },
    });
  });
  map.on("click", "achievements", (ev) => {
    const f = ev.features?.[0];
    if (!f) return;
    // maplibre-gl v6 returns feature properties as plain values.
    const { id, title, unlocked } = f.properties as { id: string; title: string; unlocked: boolean };
    const html = `<strong>${escape(title)}</strong><br>` + (unlocked ? "🏆 解除済み" : ctx.canWrite ? `<button class="unlock" data-id="${id}">解除！</button>` : "");
    new Popup().setLngLat((f.geometry as Point).coordinates as [number, number]).setHTML(html).addTo(map);
  });
  map.on("mouseenter", "achievements", () => (map.getCanvas().style.cursor = "pointer"));
  map.on("mouseleave", "achievements", () => (map.getCanvas().style.cursor = ""));

  return {
    update() {
      (map.getSource("achievements") as GeoJSONSource | undefined)?.setData(ctx.achievements());
      (map.getSource("here") as GeoJSONSource | undefined)?.setData(hereData());
      const h = ctx.here();
      if (h && !fittedWithHere && !moved) {
        fittedWithHere = true;
        map.fitBounds(boundsOf(points(), h)!, { padding: PADDING, maxZoom: 16 });
      }
    },
    flyTo: (lngLat) => map.flyTo({ center: lngLat, zoom: 16 }),
    resize: () => map.resize(),
  };
}

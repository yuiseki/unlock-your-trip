import type { CircleLayerSpecification } from "maplibre-gl";

export const UNLOCKED = "#16a34a";
export const TO_DO = "#d97706";

export const miniAchievementLayer: CircleLayerSpecification = {
  id: "achievements",
  type: "circle",
  source: "achievements",
  layout: { "circle-sort-key": ["case", ["get", "unlocked"], 1, 0] },
  paint: { "circle-radius": 4, "circle-color": ["case", ["get", "unlocked"], UNLOCKED, TO_DO], "circle-stroke-width": 1, "circle-stroke-color": "#ffffff" },
};

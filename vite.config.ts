import { defineConfig } from "vite";

export default defineConfig({
  build: {
    // The only chunk over 500 kB is maplibre-gl itself (about 1 MB minified,
    // 300 kB gzipped). It is loaded only when the map tab opens, and the
    // list starts with an 9 kB entry, so the default warning has nothing
    // left to fix.
    chunkSizeWarningLimit: 1100,
  },
});

import { defineConfig } from "vite";

export default defineConfig({
  server: { host: true, port: 5173 },
  preview: { host: true, port: 4173 },
  // Phaser itself is ~1.5 MB minified (~430 KB gzip); that's expected for a game bundle.
  build: { chunkSizeWarningLimit: 2000 },
});

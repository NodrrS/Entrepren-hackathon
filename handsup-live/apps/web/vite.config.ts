import { resolve } from "node:path";
import { defineConfig } from "vite";

export default defineConfig({
  // host: true only when LIVE_LAN=1, to test on a phone in the same Wi-Fi (camera needs HTTPS or localhost).
  server: { host: process.env["LIVE_LAN"] ? true : "localhost", port: 5173, strictPort: true },
  preview: { host: process.env["LIVE_LAN"] ? true : "localhost", port: 4173, strictPort: true },
  build: {
    target: "es2022",
    sourcemap: false,
    // Hashed build files go to /app/ (not /assets/, which the landing site in site/ uses), so they can be cached forever.
    assetsDir: "app",
    rollupOptions: {
      input: {
        harness: resolve(import.meta.dirname, "index.html"),
        live: resolve(import.meta.dirname, "live/index.html"),
      },
    },
  },
  // onnxruntime-web loads its WASM from /ort/ (self-hosted); do not pre-bundle it in dev.
  optimizeDeps: { exclude: ["onnxruntime-web"] },
});

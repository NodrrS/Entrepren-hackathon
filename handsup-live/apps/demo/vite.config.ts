import { resolve } from "node:path";
import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: { alias: { "@": resolve(import.meta.dirname, "src") } },
  server: { host: "localhost", port: 5174, strictPort: true },
  build: {
    target: "es2022",
    sourcemap: false,
    // Hashed build files go to /app/ so the server can cache them forever (same layout as apps/web).
    assetsDir: "app",
  },
  // onnxruntime-web loads its WASM from a self-hosted hashed asset; do not pre-bundle it in dev.
  optimizeDeps: { exclude: ["onnxruntime-web"] },
});

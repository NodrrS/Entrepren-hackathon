import { createReadStream, existsSync, mkdirSync, readdirSync, statSync, writeFileSync } from "node:fs";
import { dirname, join, normalize, resolve } from "node:path";
import { defineConfig, type Plugin } from "vite";

/**
 * Dev-only landmark extraction helper (tools/extract.html). Active only when POPSIGN_DIR is set:
 *   GET  /__popsign/list            -> JSON list of video paths (relative to POPSIGN_DIR/vid)
 *   GET  /__popsign/vid/<path>      -> the video file
 *   POST /__popsign/save/<path>     -> writes the JSON body to POPSIGN_DIR/landmarks/<path>
 * Never part of a build; it serves files from the local disk to the local browser only.
 */
function popsignTools(): Plugin {
  const root = process.env["POPSIGN_DIR"];
  return {
    name: "handsup-popsign-tools",
    apply: "serve",
    configureServer(server) {
      if (!root) return;
      const vid = resolve(root, "vid");
      const out = resolve(root, "landmarks");
      const frames = resolve(root, "frames");
      const inside = (base: string, rel: string) => {
        const p = normalize(join(base, decodeURIComponent(rel)));
        if (!p.startsWith(base)) throw new Error("path outside the folder");
        return p;
      };
      server.middlewares.use((req, res, next) => {
        const url = req.url ?? "";
        if (!url.startsWith("/__popsign/")) return next();
        try {
          if (url === "/__popsign/list-frames" || url === "/__popsign/list-done2") {
            // clip folders with meta.json (frames) or finished landmark files, as split/sign/clip
            const res2: string[] = [];
            const base = url.endsWith("frames") ? frames : out;
            const walk = (d: string, rel: string) => {
              for (const n of readdirSync(d)) {
                const p = join(d, n);
                if (statSync(p).isDirectory()) {
                  if (existsSync(join(p, "meta.json"))) res2.push(`${rel}${n}`);
                  else walk(p, `${rel}${n}/`);
                } else if (n.endsWith(".json") && base === out) res2.push(`${rel}${n.replace(/\.json$/, "")}`);
              }
            };
            if (existsSync(base)) walk(base, "");
            res.setHeader("content-type", "application/json");
            res.end(JSON.stringify(res2));
          } else if (url === "/__popsign/hand-task") {
            // dev-only hand model (HandsUp-models/mediapipe-extra), never in public/ or a build
            res.setHeader("content-type", "application/octet-stream");
            createReadStream(resolve(root, "..", "mediapipe-extra", "hand_landmarker.task")).on("error", () => { res.statusCode = 404; res.end(); }).pipe(res);
          } else if (url.startsWith("/__popsign/fr/") && req.method === "GET") {
            const p = inside(frames, url.slice("/__popsign/fr/".length));
            res.setHeader("content-type", p.endsWith(".json") ? "application/json" : "image/jpeg");
            createReadStream(p).on("error", () => { res.statusCode = 404; res.end(); }).pipe(res);
          } else if (url === "/__popsign/list" || url === "/__popsign/list-done") {
            const done = url.endsWith("-done");
            const files: string[] = [];
            const walk = (d: string, rel: string) => {
              for (const n of readdirSync(d)) {
                const p = join(d, n);
                if (statSync(p).isDirectory()) walk(p, `${rel}${n}/`);
                else if (!done && n.endsWith(".mp4")) files.push(`${rel}${n}`);
                else if (done && n.endsWith(".json")) files.push(`${rel}${n.replace(/\.json$/, ".mp4")}`);
              }
            };
            const base = done ? out : vid;
            if (existsSync(base)) walk(base, "");
            res.setHeader("content-type", "application/json");
            res.end(JSON.stringify(files));
          } else if (url.startsWith("/__popsign/vid/") && req.method === "GET") {
            const p = inside(vid, url.slice("/__popsign/vid/".length));
            res.setHeader("content-type", "video/mp4");
            createReadStream(p).on("error", () => { res.statusCode = 404; res.end(); }).pipe(res);
          } else if (url.startsWith("/__popsign/save/") && req.method === "POST") {
            const p = inside(out, url.slice("/__popsign/save/".length));
            const chunks: Buffer[] = [];
            req.on("data", (c: Buffer) => chunks.push(c));
            req.on("end", () => {
              mkdirSync(dirname(p), { recursive: true });
              writeFileSync(p, Buffer.concat(chunks));
              res.end("ok");
            });
          } else next();
        } catch (err) {
          res.statusCode = 400;
          res.end(String(err));
        }
      });
    },
  };
}

export default defineConfig({
  plugins: [popsignTools()],
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
        pharmacy: resolve(import.meta.dirname, "pharmacy/index.html"),
      },
    },
  },
  // onnxruntime-web loads its WASM from /ort/ (self-hosted); do not pre-bundle it in dev.
  optimizeDeps: { exclude: ["onnxruntime-web"] },
});

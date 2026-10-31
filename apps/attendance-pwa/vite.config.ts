import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { defineConfig, loadEnv } from "vite";

export default defineConfig(({ command, mode }) => {
  const env = loadEnv(mode, process.cwd(), "VITE_");
  return {
    plugins: [
      {
        name: "attendance-offline-assets",
        generateBundle(_options, bundle) {
          const assets = [
            ...Object.keys(bundle).filter((v) =>
              /\.(js|css|svg|png|webp)$/.test(v),
            ),
            "icon-192.png",
            "icon-512.png",
            "apple-touch-icon.png",
            "brand-mark.webp",
            "manifest.webmanifest",
            "Header-PWA.svg",
          ];
          const version = createHash("sha256")
            .update(assets.join("|"))
            .digest("hex")
            .slice(0, 16);
          this.emitFile({
            type: "asset",
            fileName: "offline-assets.json",
            source: JSON.stringify(assets),
          });
          this.emitFile({
            type: "asset",
            fileName: "sw.js",
            source: readFileSync(
              resolve("apps/attendance-pwa/public/sw.js"),
              "utf8",
            ).replace("__BUILD_VERSION__", version),
          });
        },
      },
    ],
    root: "apps/attendance-pwa",
    cacheDir: "../../node_modules/.vite/attendance-pwa",
    base: env.VITE_BASE_PATH ?? (command === "build" ? "/attendance/" : "/"),
    server: {
      host: "0.0.0.0",
      port: 4178,
      strictPort: true,
      fs: { allow: [process.cwd()] },
      proxy: { "/api": "http://localhost:3000" },
    },
    preview: {
      port: 4178,
      proxy: { "/api": "http://localhost:3000" },
    },
    build: {
      outDir: "dist",
      emptyOutDir: true,
      sourcemap: false,
    },
  };
});

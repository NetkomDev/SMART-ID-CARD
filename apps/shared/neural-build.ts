import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import type { Plugin } from "vite";

export function portalOffline(app: string): Plugin {
  return {
    name: "aksis-portal-offline",
    generateBundle(_opts, bundle) {
      const assets = [
        ...Object.keys(bundle).filter((v) => /\.(js|css|svg|png|webp)$/.test(v)),
        "icon-192.png",
        "icon-512.png",
        "manifest.webmanifest",
      ];
      const unique = [...new Set(assets)];
      const hasher = createHash("sha256").update(unique.join("|"));
      hasher.update(readFileSync(resolve(`apps/${app}/public/sw.js`)));
      const hash = hasher.digest("hex").slice(0, 16);
      this.emitFile({
        type: "asset",
        fileName: "offline-assets.json",
        source: JSON.stringify(unique),
      });
      this.emitFile({
        type: "asset",
        fileName: "sw.js",
        source: readFileSync(resolve(`apps/${app}/public/sw.js`), "utf8").replace(
          "__BUILD_VERSION__",
          hash
        ),
      });
    },
  };
}

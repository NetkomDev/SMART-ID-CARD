import { defineConfig } from "vite";
export default defineConfig({ root: "apps/parent-pwa", publicDir: "public", build: { outDir: "dist", emptyOutDir: true, sourcemap: true, chunkSizeWarningLimit: 250 }, server: { port: 4174, strictPort: true, proxy: { "/api": "http://localhost:3000" } } });

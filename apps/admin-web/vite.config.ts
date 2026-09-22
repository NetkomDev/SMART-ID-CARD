import { defineConfig } from "vite";

export default defineConfig({
  root: "apps/admin-web",
  publicDir: "public",
  build: {
    outDir: "dist",
    emptyOutDir: true,
    sourcemap: true,
    chunkSizeWarningLimit: 300
  },
  server: {
    port: 4173,
    strictPort: true,
    proxy: { "/api": "http://localhost:3000", "/health": "http://localhost:3000" }
  }
});

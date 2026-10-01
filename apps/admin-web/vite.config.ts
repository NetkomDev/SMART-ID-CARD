import { defineConfig } from "vite";

export default defineConfig({
  root: "apps/admin-web",
  cacheDir: "../../node_modules/.vite/admin-web",
  publicDir: "public",
  build: {
    outDir: "dist",
    emptyOutDir: true,
    sourcemap: false,
    target: "es2020",
    chunkSizeWarningLimit: 300
  },
  server: {
    host: true,
    port: 4173,
    strictPort: true,
    proxy: { "/api": "http://localhost:3000", "/health": "http://localhost:3000" }
  },
  optimizeDeps: {
    include: ['qrcode']
  }
});

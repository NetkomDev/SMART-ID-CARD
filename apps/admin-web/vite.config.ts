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
    chunkSizeWarningLimit: 600,
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (id.includes("node_modules/xlsx")) {
            return "vendor-xlsx";
          }
          if (id.includes("node_modules/qrcode") || id.includes("node_modules/html5-qrcode")) {
            return "vendor-qrcode";
          }
          if (id.includes("node_modules/@supabase")) {
            return "vendor-supabase";
          }
        }
      }
    }
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


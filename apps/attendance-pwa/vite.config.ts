import { defineConfig, loadEnv } from "vite";

export default defineConfig(({ command, mode }) => {
  const env = loadEnv(mode, process.cwd(), "VITE_");
  return {
    root: "apps/attendance-pwa",
    cacheDir: "../../node_modules/.vite/attendance-pwa",
    base: env.VITE_BASE_PATH ?? (command === "build" ? "/attendance/" : "/"),
    server: {
      host: "0.0.0.0",
      port: 4178,
      strictPort: true,
      fs: { allow: [process.cwd()] },
      proxy: { "/api": "http://localhost:3000" }
    },
    preview: {
      port: 4178,
      proxy: { "/api": "http://localhost:3000" }
    },
    build: {
      outDir: "dist",
      emptyOutDir: true,
      sourcemap: false
    }
  };
});

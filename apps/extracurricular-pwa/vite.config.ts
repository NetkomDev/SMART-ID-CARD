import { defineConfig, loadEnv } from "vite";
import { portalOffline } from "../shared/neural-build";

export default defineConfig(({ command, mode }) => {
  const env = loadEnv(mode, process.cwd(), "VITE_");
  return {
    plugins: [portalOffline("extracurricular-pwa")],
    root: "apps/extracurricular-pwa",
    cacheDir: "../../node_modules/.vite/extracurricular-pwa",
    base: env.VITE_BASE_PATH ?? (command === "build" ? "/extracurricular/" : "/"),
    server: { host: "0.0.0.0", port: 4176, strictPort: true, allowedHosts: true, fs: { allow: [process.cwd()] }, proxy: { "/api": "http://localhost:3000" } },
    preview: { port: 4176, proxy: { "/api": "http://localhost:3000" } },
    build: { outDir: "dist", emptyOutDir: true, sourcemap: false }
  };
});

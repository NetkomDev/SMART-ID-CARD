import { defineConfig, loadEnv } from "vite";
export default defineConfig(({ command, mode }) => {
  const env = loadEnv(mode, process.cwd(), "VITE_");
  return { root: "apps/waste-pwa", base: env.VITE_BASE_PATH ?? (command === "build" ? "/waste/" : "/"),
    server: { host: "0.0.0.0", port: 4175, strictPort: true, fs: { allow: [process.cwd()] }, proxy: { "/api": "http://localhost:3000" } },
    preview: { port: 4175, proxy: { "/api": "http://localhost:3000" } },
    build: { outDir: "dist", emptyOutDir: true, sourcemap: true } };
});

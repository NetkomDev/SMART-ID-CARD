import { spawnSync } from "node:child_process";
const apps = ["api", "admin-web", "parent-pwa", "waste-pwa", "extracurricular-pwa", "attendance-pwa", "library-terminal", "led-gateway", "command-center", "card-writer", "operations-console"];
const mode = process.argv[2];
if (!["typecheck", "build"].includes(mode)) throw Error("Expected typecheck or build");
for (const app of apps) {
  const args = mode === "typecheck" || app === "api" ? ["tsc", "-p", `apps/${app}/tsconfig.json`, ...(mode === "typecheck" ? ["--noEmit"] : [])] : ["vite", "build", "--config", `apps/${app}/vite.config.ts`];
  console.log(`${mode.toUpperCase()} ${app}`);
  const result = spawnSync(process.execPath, [`node_modules/${args[0] === "tsc" ? "typescript/bin/tsc" : "vite/bin/vite.js"}`, ...args.slice(1)], { stdio: "inherit" });
  if (result.status !== 0) process.exit(result.status ?? 1);
}

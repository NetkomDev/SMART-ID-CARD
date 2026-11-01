import { cpSync, mkdirSync, rmSync, existsSync } from "node:fs";
const apps = { "admin-web": "", "parent-pwa": "parent", "waste-pwa": "pwa-waste", "extracurricular-pwa": "pwa-extracurricular", "attendance-pwa": "pwa-attendance", "library-terminal": "pwa-library", "led-gateway": "pwa-led", "command-center": "command", "card-writer": "card-writer", "operations-console": "operations" };
for (const app of Object.keys(apps)) if (!existsSync(`apps/${app}/dist/index.html`)) throw Error(`Missing build: ${app}`);
rmSync("dist", { recursive: true, force: true }); mkdirSync("dist");
for (const [app, target] of Object.entries(apps)) cpSync(`apps/${app}/dist`, `dist/${target}`, { recursive: true });
console.log("Packaged ten frontend entrypoints.");

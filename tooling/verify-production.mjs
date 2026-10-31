import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";

const base = process.env.AKSIS_PRODUCTION_URL ?? "https://www.aksis.co.id";
const paths = ["/", "/parent/", "/waste/", "/extracurricular/", "/library/", "/led/", "/command/", "/card-writer/", "/operations/"];
const checks = [];
let adminHtml = "";
for (const path of paths) {
  const response = await fetch(`${base}${path}`, { cache: "no-store", signal: AbortSignal.timeout(30000) });
  assert.equal(response.status, 200, `${path} must be available`);
  assert.match(response.headers.get("content-type") ?? "", /text\/html/, `${path} must serve HTML`);
  const html = await response.text();
  if (path === "/") adminHtml = html;
  checks.push({ path, status: response.status, content_type: response.headers.get("content-type") });
}
for (const path of ["/api/v1/health", "/api/v1/dashboard/today"]) {
  const response = await fetch(`${base}${path}`, { cache: "no-store", signal: AbortSignal.timeout(30000) });
  const data = await response.json();
  assert.equal(response.status, path.endsWith("health") ? 200 : 401, `API check ${path}`);
  if (path.endsWith("health")) assert.equal(data.data?.status, "ok");
  checks.push({ path, status: response.status, code: data.error?.code ?? data.data?.status });
}
for (const match of adminHtml.matchAll(/(?:src|href)="([^"]+\.(?:js|css))"/g)) {
  const path = match[1];
  const response = await fetch(new URL(path, base), { signal: AbortSignal.timeout(30000) });
  assert.equal(response.status, 200, `Asset ${path}`);
  const bytes = Buffer.from(await response.arrayBuffer());
  let local = null;
  try { local = await readFile(`apps/admin-web/dist${path}`); } catch(error) { if(error.code !== "ENOENT") throw error; }
  const hash = value => createHash("sha256").update(value).digest("hex");
  if (local) assert.equal(hash(bytes), hash(local), `Production asset must match verified local build: ${path}`);
  else {
    assert.ok(path.includes("/index-") && path.endsWith(".js"), `Unexpected production asset ${path}`);
    for (const marker of ["--cc-viewport-height","cc-library-legend","DATA DEMO","Tanpa kelas tercatat","/devices/summary"]) assert.ok(bytes.toString().includes(marker), `Updated UI marker ${marker}`);
  }
  if (path.endsWith(".css")) {
    assert.ok(bytes.toString().includes("--cc-viewport-height"), "Viewport fix present in production");
    assert.ok(bytes.toString().includes("cc-podium-track"), "Podium fix present in production");
  }
  checks.push({ path, status: response.status, sha256: hash(bytes), matches_local_build: local !== null, ...(local ? {} : {validation:"updated Command Center markers present; cloud build fingerprint differs"}) });
}
const report = { verified_at: new Date().toISOString(), base, checks, result: "PASS" };
if (process.env.AKSIS_SMOKE_OUTPUT) await writeFile(process.env.AKSIS_SMOKE_OUTPUT, JSON.stringify(report, null, 2) + "\n");
console.log(`PASS: ${paths.length} entrypoints, API health, authentication boundary, and production assets verified at ${base}`);

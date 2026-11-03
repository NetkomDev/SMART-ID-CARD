import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { writeFile } from "node:fs/promises";

const base = process.env.AKSIS_PRODUCTION_URL ?? "https://www.aksis.co.id";
const paths = [
  "/",
  "/parent/",
  "/waste/",
  "/extracurricular/",
  "/attendance/",
  "/library/",
  "/led/",
  "/command/",
  "/card-writer/",
  "/operations/",
];
const checks = [];
let adminHtml = "";

for (const path of paths) {
  const response = await fetch(`${base}${path}`, {
    cache: "no-store",
    signal: AbortSignal.timeout(30000),
  });
  assert.equal(response.status, 200, `${path} must be available`);
  assert.match(
    response.headers.get("content-type") ?? "",
    /text\/html/,
    `${path} must serve HTML`,
  );
  const html = await response.text();
  if (path === "/") adminHtml = html;
  checks.push({
    path,
    status: response.status,
    content_type: response.headers.get("content-type"),
  });
}

for (const path of ["/api/v1/health", "/api/v1/dashboard/today"]) {
  const response = await fetch(`${base}${path}`, {
    cache: "no-store",
    signal: AbortSignal.timeout(30000),
  });
  const data = await response.json();
  assert.equal(
    response.status,
    path.endsWith("health") ? 200 : 401,
    `API check ${path}`,
  );
  if (path.endsWith("health")) assert.equal(data.data?.status, "ok");
  checks.push({
    path,
    status: response.status,
    code: data.error?.code ?? data.data?.status,
  });
}

const hash = (value) => createHash("sha256").update(value).digest("hex");

for (const match of adminHtml.matchAll(/(?:src|href)="([^"]+\.(?:js|css))"/g)) {
  const path = match[1];
  const response = await fetch(new URL(path, base), {
    signal: AbortSignal.timeout(30000),
  });
  assert.equal(response.status, 200, `Asset ${path}`);
  const bytes = Buffer.from(await response.arrayBuffer());
  assert.ok(bytes.length > 0, `Asset ${path} must not be empty`);
  checks.push({
    path,
    status: response.status,
    sha256: hash(bytes),
    bytes: bytes.length,
  });
}

const report = {
  verified_at: new Date().toISOString(),
  base,
  checks,
  result: "PASS",
};
if (process.env.AKSIS_SMOKE_OUTPUT) {
  await writeFile(
    process.env.AKSIS_SMOKE_OUTPUT,
    JSON.stringify(report, null, 2) + "\n",
  );
}
console.log(
  `PASS: ${paths.length} entrypoints, API health, authentication boundary, and production assets verified at ${base}`,
);

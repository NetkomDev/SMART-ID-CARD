// Process metrics are diagnostic. Aggregate histogram buckets/counters in the telemetry backend.
const started = Date.now();
const bounds = [50, 100, 250, 500, 750, 1000, 2500, 5000, Infinity];
const buckets = bounds.map(() => 0);
let requests = 0, errors = 0, sum = 0;
export function recordMetric(status: number, durationMs: number) {
  requests++; if (status >= 500) errors++; sum += durationMs;
  bounds.forEach((bound, index) => { if (durationMs <= bound) buckets[index]!++; });
}
export function prometheusMetrics() {
  return [
    '# HELP aksis_uptime_seconds Current process uptime; not global availability',
    '# TYPE aksis_uptime_seconds gauge', `aksis_uptime_seconds ${(Date.now() - started) / 1000}`,
    '# TYPE aksis_http_requests_total counter', `aksis_http_requests_total ${requests}`,
    '# TYPE aksis_http_errors_total counter', `aksis_http_errors_total ${errors}`,
    '# HELP aksis_http_duration_ms Per-process histogram; aggregate buckets before calculating percentiles',
    '# TYPE aksis_http_duration_ms histogram',
    ...bounds.map((bound, i) => `aksis_http_duration_ms_bucket{le="${Number.isFinite(bound) ? bound : '+Inf'}"} ${buckets[i]}`),
    `aksis_http_duration_ms_sum ${sum}`, `aksis_http_duration_ms_count ${requests}`
  ].join('\n') + '\n';
}

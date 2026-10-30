import { describe, expect, it } from "vitest";
import { prometheusMetrics, recordMetric } from "./metrics.js";
describe("aggregatable process histograms", () => {
  it("exports cumulative buckets instead of a misleading global p95", () => {
    recordMetric(200, 75); recordMetric(500, 600);
    const output = prometheusMetrics();
    expect(output).toContain('aksis_http_duration_ms_bucket{le="100"} 1');
    expect(output).toContain('aksis_http_duration_ms_bucket{le="750"} 2');
    expect(output).toContain("aksis_http_errors_total 1");
    expect(output).not.toContain("duration_p95");
  });
});

import { describe, expect, it } from "vitest";
import { appendSample, freshness, linePoints, online, type Snapshot } from "./model";
const snapshot = (date: string, time: string, total = 0) => ({ date, generated_at: time, metrics: { attendance: { total } } }) as Snapshot;
describe("command center monitoring", () => {
  it("records real snapshots only once and starts a new chart on a new school day", () => {
    const first = snapshot("2026-09-27", "2026-09-27T01:00:00Z", 12);
    const samples = appendSample([], first);
    expect(appendSample(samples, first)).toEqual(samples);
    const next = snapshot("2026-09-28", "2026-09-28T01:00:00Z", 2);
    expect(appendSample(samples, next)).toEqual([{ at: Date.parse(next.generated_at), date: next.date, value: 2 }]);
  });
  it("bounds chart memory and ignores invalid timestamps", () => {
    let samples = appendSample([], snapshot("2026-09-27", "invalid"));
    expect(samples).toEqual([]);
    for (let i = 0; i < 40; i++) samples = appendSample(samples, snapshot("2026-09-27", new Date(1000 * i).toISOString(), i));
    expect(samples).toHaveLength(30);
    expect(samples[0]?.value).toBe(10);
  });
  it("draws one point and zero data without inventing history or dividing by zero", () => {
    expect(linePoints([])).toBe("");
    const points = appendSample([], snapshot("2026-09-27", "2026-09-27T01:00:00Z", 0));
    expect(linePoints(points)).toBe("20,140");
    expect(linePoints([...points, { ...points[0]!, at: points[0]!.at + 1000 }])).not.toMatch(/NaN|Infinity/);
  });
  it("requires an active device and a recent, credible heartbeat", () => {
    const now = Date.parse("2026-09-27T01:00:00Z");
    expect(online(new Date(now - 30_000).toISOString(), "ACTIVE", now)).toBe(true);
    expect(online(new Date(now - 300_000).toISOString(), "ACTIVE", now)).toBe(false);
    expect(online(new Date(now).toISOString(), "DISABLED", now)).toBe(false);
    expect(online(new Date(now + 600_000).toISOString(), "ACTIVE", now)).toBe(false);
    expect(online(null, "ACTIVE", now)).toBe(false);
  });
  it("marks failed or old snapshots instead of claiming a live connection", () => {
    const value = { stale_after: new Date(2000).toISOString() } as Snapshot;
    expect(freshness(null, false, 1000)).toBe("loading");
    expect(freshness(value, false, 1000)).toBe("live");
    expect(freshness(value, false, 3000)).toBe("stale");
    expect(freshness(value, true, 1000)).toBe("offline");
  });
});

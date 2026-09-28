export type Snapshot = {
  school_id: string; date: string; timezone: string; generated_at: string; stale_after: string;
  metrics: {
    attendance: { total: number; late: number; students: number };
    waste: { total_kg: number; transactions: number };
    library: { visits: number; students: number };
    extracurricular: { recorded: number; present: number };
  };
};
export type Sample = { at: number; value: number; date: string };
export function appendSample(samples: Sample[], snapshot: Snapshot): Sample[] {
  const at = Date.parse(snapshot.generated_at);
  if (!Number.isFinite(at)) return samples;
  const current = samples.filter(sample => sample.date === snapshot.date);
  if (current.some(sample => sample.at === at)) return current;
  return [...current, { at, value: snapshot.metrics.attendance.total, date: snapshot.date }].sort((a, b) => a.at - b.at).slice(-30);
}
export function online(lastSeen: string | null | undefined, status: string, now = Date.now()): boolean {
  const time = Date.parse(lastSeen ?? "");
  return status === "ACTIVE" && Number.isFinite(time) && time <= now + 60_000 && now - time < 300_000;
}
export function freshness(snapshot: Snapshot | null, failed: boolean, now = Date.now()): "loading" | "live" | "stale" | "offline" {
  if (failed) return "offline";
  if (!snapshot) return "loading";
  return Date.parse(snapshot.stale_after) > now ? "live" : "stale";
}
export function linePoints(samples: Sample[], width = 600, height = 150): string {
  const max = Math.max(1, ...samples.map(s => s.value));
  const first = samples[0]?.at ?? 0;
  const span = Math.max(1, (samples.at(-1)?.at ?? first) - first);
  return samples.map(s => `${20 + (samples.length === 1 ? 0 : (s.at - first) / span) * (width - 40)},${height - 10 - s.value / max * (height - 25)}`).join(" ");
}

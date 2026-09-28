export type RankingEvent = { id: string; student_id?: string | undefined; class_id: string | null; at: string; value?: number | undefined; name?: string | undefined; class_name?: string | undefined };
export function competitionRankings(events: { attendance: RankingEvent[]; waste: RankingEvent[]; library: RankingEvent[] }, timezone: string, now = new Date()) {
  const format = new Intl.DateTimeFormat('en-CA', { timeZone: timezone, year: 'numeric', month: '2-digit', day: '2-digit' });
  const date = format.format(now);
  const today = (e: RankingEvent) => Number.isFinite(Date.parse(e.at)) && Date.parse(e.at) <= now.getTime() && format.format(new Date(e.at)) === date;
  const seen = new Set<string>();
  const arrivals = events.attendance.filter(today).sort((a, b) => Date.parse(a.at) - Date.parse(b.at) || a.id.localeCompare(b.id)).filter(e => {
    if (!e.student_id || seen.has(e.student_id)) return false;
    seen.add(e.student_id); return true;
  });
  const rankClasses = (rows: RankingEvent[], weight: boolean) => {
    const classes = new Map<string, { class_id: string; name: string; value: number }>();
    for (const e of rows.filter(today)) {
      if (!e.class_id) continue;
      const value = weight ? Math.round(Number(e.value ?? 0) * 1000) : 1;
      if (!Number.isFinite(value) || value <= 0) continue;
      const row = classes.get(e.class_id) ?? { class_id: e.class_id, name: e.class_name ?? 'Kelas', value: 0 };
      row.value += value; classes.set(e.class_id, row);
    }
    const sorted = [...classes.values()].sort((a, b) => b.value - a.value || a.name.localeCompare(b.name) || a.class_id.localeCompare(b.class_id));
    let rank = 0;
    return sorted.map((row, i) => {
      if (i === 0 || row.value !== sorted[i - 1]!.value) rank = i + 1;
      return { ...row, value: weight ? row.value / 1000 : row.value, rank };
    }).slice(0, 3);
  };
  let rank = 0;
  return {
    date, timezone, generated_at: now.toISOString(),
    arrivals: arrivals.slice(0, 5).map((e, i) => {
      if (i === 0 || Date.parse(e.at) !== Date.parse(arrivals[i - 1]!.at)) rank = i + 1;
      return { student_id: e.student_id, name: e.name ?? 'Siswa', class_name: e.class_name ?? 'Belum ada kelas', at: e.at, rank };
    }),
    waste: rankClasses(events.waste, true), library: rankClasses(events.library, false)
  };
}

export type SupportStudent = { id: string; name: string; class_name: string };
export type SupportEvent = { id: string; student_id: string; at: string; is_late?: boolean | undefined; value?: number | undefined };
export function studentSupport(students: SupportStudent[], events: { attendance: SupportEvent[]; waste: SupportEvent[]; library: SupportEvent[] }, timezone: string, now = new Date()) {
  const format = new Intl.DateTimeFormat('en-CA', { timeZone: timezone, year: 'numeric', month: '2-digit', day: '2-digit' });
  const end = format.format(now), start = end.slice(0, 7) + '-01';
  const valid = (e: SupportEvent) => Number.isFinite(Date.parse(e.at)) && Date.parse(e.at) <= now.getTime() && format.format(new Date(e.at)) >= start && format.format(new Date(e.at)) <= end;
  const scores = new Map(students.map(s => [s.id, { student_id: s.id, name: s.name, class_name: s.class_name, late: 0, waste: 0, library: 0 }]));
  const first = new Map<string, SupportEvent>();
  for (const e of events.attendance.filter(valid)) {
    const key = `${e.student_id}:${format.format(new Date(e.at))}`, previous = first.get(key);
    if (!previous || Date.parse(e.at) < Date.parse(previous.at) || (e.at === previous.at && e.id < previous.id)) first.set(key, e);
  }
  for (const e of first.values()) { const row = scores.get(e.student_id); if (row && e.is_late) row.late++; }
  for (const e of events.waste.filter(valid)) { const row = scores.get(e.student_id), grams = Math.round(Number(e.value ?? 0) * 1000); if (row && Number.isFinite(grams) && grams > 0) row.waste += grams; }
  for (const e of events.library.filter(valid)) { const row = scores.get(e.student_id); if (row) row.library++; }
  const rows = [...scores.values()];
  const category = (key: 'late' | 'waste' | 'library') => {
    const candidates = rows.filter(r => key !== 'late' || r.late > 0).sort((a, b) => (key === 'late' ? b[key] - a[key] : a[key] - b[key]) || a.name.localeCompare(b.name) || a.student_id.localeCompare(b.student_id));
    return { total: candidates.length, zero_count: candidates.filter(r => r[key] === 0).length, rows: candidates.slice(0, 3).map(r => ({ student_id: r.student_id, name: r.name, class_name: r.class_name, value: key === 'waste' ? r[key] / 1000 : r[key] })) };
  };
  return { period_start: start, period_end: end, timezone, generated_at: now.toISOString(), students_count: rows.length, late: category('late'), waste: category('waste'), library: category('library') };
}

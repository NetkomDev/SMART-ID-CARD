import { describe, expect, it } from 'vitest';
import { competitionRankings, type RankingEvent } from './dashboard-rankings.js';
const now = new Date('2026-09-27T01:00:00Z');
const event = (id: string, at = '2026-09-26T23:00:00Z', extra: Partial<RankingEvent> = {}): RankingEvent => ({ id, at, class_id: 'a', class_name: 'X A', student_id: id, name: id, ...extra });
const rank = (attendance: RankingEvent[] = [], waste: RankingEvent[] = [], library: RankingEvent[] = []) => competitionRankings({ attendance, waste, library }, 'Asia/Makassar', now);
describe('daily competition rankings', () => {
  it('uses the school date, excludes previous day and future events, and keeps the first arrival per student', () => {
    const rows = [event('repeat', '2026-09-27T00:00:00Z', { student_id: 'first' }), event('first'), event('previous', '2026-09-26T15:59:59Z'), event('future', '2026-09-27T02:00:00Z'), event('midnight', '2026-09-26T16:00:00Z')];
    const result = rank(rows);
    expect(result.date).toBe('2026-09-27');
    expect(result.arrivals.map(r => r.student_id)).toEqual(['midnight', 'first']);
    expect(result.arrivals[1]?.at).toBe('2026-09-26T23:00:00Z');
  });
  it('adds all class deposits accurately to grams and awards equal ranks for equal totals', () => {
    const result = rank([], [event('1', undefined, { value: .1 }), event('2', undefined, { value: .2 }), event('3', undefined, { class_id: 'b', class_name: 'X B', value: .3 }), event('4', undefined, { class_id: 'c', value: .05 }), event('5', undefined, { class_id: null, value: 999 })]);
    expect(result.waste.map(r => [r.value, r.rank])).toEqual([[.3, 1], [.3, 1], [.05, 3]]);
  });
  it('counts visits per class rather than distinct students and includes contributions beyond the first database page', () => {
    const rows = Array.from({ length: 1200 }, (_, i) => event(String(i), undefined, { student_id: 'same', class_id: i < 501 ? 'a' : 'b', class_name: i < 501 ? 'X A' : 'X B' }));
    expect(rank([], [], rows).library.map(r => [r.class_id, r.value])).toEqual([['b', 699], ['a', 501]]);
  });
  it('returns at most five arrivals and three contributing classes with deterministic ties', () => {
    const rows = Array.from({ length: 10 }, (_, i) => event(String(i), undefined, { class_id: String(i), class_name: `X ${i}`, value: i + 1 }));
    expect(rank(rows, rows, rows).arrivals).toHaveLength(5);
    expect(rank(rows, rows, rows).arrivals.every(r => r.rank === 1)).toBe(true);
    expect(rank(rows, rows, rows).waste.map(r => r.value)).toEqual([10, 9, 8]);
  });
  it('does not fabricate winners when there are no qualifying events', () => {
    expect(rank().arrivals).toEqual([]);
    expect(rank().waste).toEqual([]);
    expect(rank([], [], [event('1', undefined, { class_id: null })]).library).toEqual([]);
  });
});

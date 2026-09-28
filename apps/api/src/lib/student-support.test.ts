import { expect, it } from 'vitest';
import { studentSupport, type SupportEvent } from './student-support.js';
const students = [{ id: 'a', name: 'Andi', class_name: 'X A' }, { id: 'b', name: 'Budi', class_name: 'X B' }, { id: 'c', name: 'Citra', class_name: 'X C' }];
const now = new Date('2026-09-27T02:00:00Z');
const event = (id: string, at: string, student_id = 'a', value = 0, is_late = false): SupportEvent => ({ id, at, student_id, value, is_late });
it('counts late first check-ins once per school day and excludes earlier months and future events', () => {
 const result = studentSupport(students, { attendance: [event('1','2026-09-01T00:00:00Z','a',0,true), event('2','2026-09-01T01:00:00Z','a',0,true), event('3','2026-09-02T00:00:00Z','a',0,false), event('4','2026-09-02T01:00:00Z','a',0,true), event('5','2026-08-31T15:59:59Z','a',0,true), event('6','2026-09-28T01:00:00Z','a',0,true), event('7','2026-08-31T16:00:00Z','b',0,true)], waste: [], library: [] }, 'Asia/Makassar', now);
 expect(result.period_start).toBe('2026-09-01');
 expect(result.late.rows.map(r=>[r.name,r.value])).toEqual([['Andi',1],['Budi',1]]);
});
it('includes zero-activity students and sums personal deposits to grams without attributing class totals to individuals', () => {
 const result = studentSupport(students, { attendance: [], waste: [event('1','2026-09-01T00:00:00Z','a',.1),event('2','2026-09-01T00:00:00Z','a',.2),event('3','2026-09-01T00:00:00Z','not-active',100)], library: [event('1','2026-09-01T00:00:00Z','b'),event('2','2026-09-01T00:00:00Z','b')] }, 'Asia/Makassar', now);
 expect(result.waste.rows.map(r=>[r.name,r.value])).toEqual([['Budi',0],['Citra',0],['Andi',.3]]);
 expect(result.waste.zero_count).toBe(2);
 expect(result.library.rows.map(r=>[r.name,r.value])).toEqual([['Andi',0],['Citra',0],['Budi',2]]);
 expect(result.late.rows).toEqual([]);
});
it('does not invent scores with an empty roster and returns deterministic three-student lists with tied totals', () => {
 const empty = { attendance: [], waste: [], library: [] };
 expect(studentSupport([],empty,'Asia/Makassar',now).waste.rows).toEqual([]);
 const result = studentSupport([...students,{id:'d',name:'Dewi',class_name:'X A'}],empty,'Asia/Makassar',now);
 expect(result.waste.total).toBe(4);
 expect(result.waste.zero_count).toBe(4);
 expect(result.waste.rows.map(r=>r.name)).toEqual(['Andi','Budi','Citra']);
});

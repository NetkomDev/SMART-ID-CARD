import { Router } from 'express';
import { fromDatabaseError } from '../lib/errors.js';
import { sendData } from '../lib/responses.js';
import { studentSupport, type SupportEvent } from '../lib/student-support.js';
import { asyncHandler } from '../middleware/async-handler.js';
import { requirePermission } from '../middleware/tenant.js';
const router = Router();
router.get('/support', ...['dashboard.read', 'student.read', 'attendance.read', 'waste.read', 'library.read'].map(requirePermission), asyncHandler(async (req, res) => {
  const client = req.auth!.client, schoolId = req.tenant!.schoolId, now = new Date();
  const { data: school, error } = await client.from('schools').select('timezone').eq('id', schoolId).single();
  if (error) throw fromDatabaseError(error);
  const month = new Intl.DateTimeFormat('en-CA', { timeZone: school!.timezone, year: 'numeric', month: '2-digit', day: '2-digit' }).format(now).slice(0, 7);
  const from = new Date(Date.parse(month + '-01T00:00:00Z') - 86400000).toISOString();
  type Row = { id: string; full_name?: string; student_id?: string; class_id?: string; classes?: { name: string } | { name: string }[]; occurred_at_local?: string; created_at?: string; occurred_at?: string; total_kg?: number; is_late?: boolean };
  const definitions = [
    { table: 'students', fields: 'id,full_name', time: '' },
    { table: 'student_class_history', fields: 'id,student_id,classes(name)', time: '' },
    { table: 'attendance_logs', fields: 'id,student_id,occurred_at_local,is_late', time: 'occurred_at_local' },
    { table: 'waste_transactions', fields: 'id,student_id,total_kg,created_at', time: 'created_at' },
    { table: 'library_visits', fields: 'id,student_id,occurred_at', time: 'occurred_at' }
  ];
  const results = await Promise.all(definitions.map(async def => {
    const rows: Row[] = []; let offset = 0;
    while (true) {
      let query = client.from(def.table).select(def.fields, { count: 'exact' }).eq('school_id', schoolId).order('id').range(offset, offset + 499);
      if (def.time) query = query.gte(def.time, from).lte(def.time, now.toISOString());
      if (def.table === 'students') query = query.eq('is_active', true).is('deleted_at', null);
      if (def.table === 'student_class_history') query = query.eq('is_current', true);
      if (def.table === 'attendance_logs') query = query.eq('direction', 'CHECK_IN');
      const { data, error, count } = await query;
      if (error) throw fromDatabaseError(error);
      const page = (data ?? []) as unknown as Row[]; rows.push(...page); offset += page.length;
      if (!page.length || offset >= (count ?? offset)) break;
    }
    return rows;
  }));
  const classNames = new Map(results[1]!.map(row => [row.student_id, (Array.isArray(row.classes) ? row.classes[0] : row.classes)?.name ?? 'Belum ada kelas']));
  const events = (rows: Row[]): SupportEvent[] => rows.map(row => ({ id: row.id, student_id: row.student_id!, at: (row.occurred_at_local ?? row.created_at ?? row.occurred_at)!, value: row.total_kg, is_late: row.is_late }));
  res.setHeader('cache-control', 'private, no-store');
  sendData(res, { school_id: schoolId, ...studentSupport(results[0]!.map(row => ({ id: row.id, name: row.full_name!, class_name: classNames.get(row.id) ?? 'Belum ada kelas' })), { attendance: events(results[2]!), waste: events(results[3]!), library: events(results[4]!) }, school!.timezone, now) });
}));
export { router as dashboardSupportRouter };

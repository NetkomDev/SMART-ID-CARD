import express from 'express';
import request from 'supertest';
import { describe, expect, it, vi } from 'vitest';
import { dashboardRouter } from './dashboard.js';
function fixture(options: { denied?: boolean; fail?: boolean } = {}) {
  const queries: { table: string; filters: Record<string, unknown>; start: number }[] = [];
  const now = new Date().toISOString();
  const client = { from: vi.fn((table: string) => {
    const filters: Record<string, unknown> = {}; let start = 0, end = 499;
    const query = {
      select: () => query, eq: (key: string, value: unknown) => { filters[key] = value; return query; },
      is: (key: string, value: unknown) => { filters[key] = value; return query; }, gte: () => query, lte: () => query, order: () => query,
      range: (a: number, b: number) => { start = a; end = b; return query; },
      single: async () => ({ data: { timezone: 'Asia/Makassar' }, error: null }),
      then: (resolve: (value: unknown) => unknown) => {
        queries.push({ table, filters, start });
        if (options.fail) return Promise.resolve(resolve({ data: null, count: 0, error: { code: 'XX000', message: 'Database failed' } }));
        const rows = table === 'waste_transactions' ? Array.from({ length: 501 }, (_, i) => ({ id: String(i), class_id: i === 500 ? 'winner' : 'other', total_kg: i === 500 ? 1000 : 1, created_at: now, classes: { name: i === 500 ? 'XI B' : 'XI A' } })) : table === 'students' ? Array.from({length:501},(_,i)=>({id:String(i),full_name:'Siswa '+String(i).padStart(3,'0')})) : [];
        return Promise.resolve(resolve({ data: rows.slice(start, end + 1), count: rows.length, error: null }));
      }
    };
    return query;
  }) };
  const app = express();
  app.use((req, _res, next) => {
    req.auth = { client } as unknown as NonNullable<typeof req.auth>;
    req.tenant = { schoolId: 'school-a', membershipId: 'member', roles: options.denied ? [] : ['SCHOOL_ADMIN'], permissions: options.denied ? ['dashboard.read'] : ['dashboard.read','student.read','attendance.read','waste.read','library.read'] };
    next();
  });
  app.use('/dashboard', dashboardRouter);
  app.use(((error: { status?: number; statusCode?: number }, _req: express.Request, res: express.Response, _next: express.NextFunction) => res.status(error.statusCode ?? error.status ?? 500).json({ error: 'failed' })) as express.ErrorRequestHandler);
  return { app, queries, client };
}
describe('dashboard rankings endpoint', () => {
  it('reads every page and scopes each query to the tenant, filtering arrival direction', async () => {
    const { app, queries } = fixture();
    const response = await request(app).get('/dashboard/rankings').expect(200);
    expect(response.body.data.school_id).toBe('school-a');
    expect(response.body.data.waste[0]).toMatchObject({ class_id: 'winner', value: 1000, rank: 1 });
    expect(queries.filter(q => q.table === 'waste_transactions').map(q => q.start)).toEqual([0, 500]);
    expect(queries.every(q => q.filters.school_id === 'school-a')).toBe(true);
    expect(queries.find(q => q.table === 'attendance_logs')?.filters.direction).toBe('CHECK_IN');
    expect(response.headers['cache-control']).toBe('private, no-store');
  });
  it('denies users without access to the source modules', async () => {
    const { app, client } = fixture({ denied: true });
    await request(app).get('/dashboard/rankings').expect(403);
    expect(client.from).not.toHaveBeenCalled();
  });
  it('returns an error instead of an incomplete leaderboard when a database query fails', async () => {
    const { app } = fixture({ fail: true });
    await request(app).get('/dashboard/rankings').expect(500);
  });
});

describe('student support endpoint', () => {
 it('includes the complete active roster, including students with no events, and enforces tenant filters', async () => {
  const {app,queries}=fixture();
  const response=await request(app).get('/dashboard/support').expect(200);
  expect(response.body.data.students_count).toBe(501);
  expect(response.body.data.library.zero_count).toBe(501);
  expect(response.body.data.library.rows).toHaveLength(3);
  expect(queries.filter(q=>q.table==='students').map(q=>q.start)).toEqual([0,500]);
  expect(queries.every(q=>q.filters.school_id==='school-a')).toBe(true);
  expect(queries.find(q=>q.table==='students')?.filters).toMatchObject({is_active:true,deleted_at:null});
  expect(queries.find(q=>q.table==='student_class_history')?.filters.is_current).toBe(true);
 });
 it('requires access to student and source records',async()=>{const {app,client}=fixture({denied:true});await request(app).get('/dashboard/support').expect(403);expect(client.from).not.toHaveBeenCalled();});
 it('does not replace failed source data with zero scores',async()=>{const {app}=fixture({fail:true});await request(app).get('/dashboard/support').expect(500);});
});

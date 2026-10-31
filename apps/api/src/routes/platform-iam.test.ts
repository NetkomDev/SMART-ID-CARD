import express from 'express';
import request from 'supertest';
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

const fixture = vi.hoisted(() => ({
  allowed: true,
  rpcHandler: vi.fn(),
  userClient: null as any,
}));

vi.mock('../middleware/auth.js', () => ({
  requireAuth: (req: any, _res: any, next: any) => {
    req.auth = {
      user: { id: '10000000-0000-4000-8000-000000000001' },
      client: fixture.userClient,
    };
    next();
  },
}));

vi.mock('../lib/supabase.js', () => ({
  createServiceClient: () => ({}),
}));

let router: express.Router;

beforeAll(async () => {
  process.env.SUPABASE_URL = 'https://example.supabase.co';
  process.env.SUPABASE_ANON_KEY = 'test-anon';
  process.env.SUPABASE_SERVICE_ROLE_KEY = 'test-service-secret-not-real';
  ({ platformRouter: router } = await import('./platform.js'));
});

beforeEach(() => {
  fixture.allowed = true;
  fixture.rpcHandler = vi.fn().mockImplementation(async (name: string, args: any) => {
    if (name === 'is_platform_admin') return { data: fixture.allowed, error: null };
    if (name === 'platform_get_iam') {
      return {
        data: [
          {
            id: 'mem-1',
            school_id: args.p_school_id || 'school-1',
            user_id: 'user-1',
            status: 'ACTIVE',
            full_name: 'Portal Teacher 1',
            school_name: 'SMA 1',
            last_sign_in_at: '2026-10-31T00:00:00Z',
            roles: [{ code: 'PORTAL_TEACHER', permissions: ['student.read'] }],
            total_count: 1,
          },
        ],
        error: null,
      };
    }
    if (name === 'platform_update_membership') {
      return {
        data: { id: args.p_id, status: args.p_status, roles: args.p_roles },
        error: null,
      };
    }
    if (name === 'platform_delete_school_user') {
      return { data: null, error: null };
    }
    return { data: null, error: null };
  });

  fixture.userClient = {
    rpc: (...args: any[]) => fixture.rpcHandler(...args),
  };
});

function app() {
  const a = express();
  a.use(express.json());
  a.use('/platform', router);
  a.use(((err: any, _req: any, res: any, _next: any) => {
    res.status(err.status ?? 500).json({
      error: { code: err.code, message: err.message },
    });
  }) as express.ErrorRequestHandler);
  return a;
}

describe('Platform IAM API', () => {
  it('supports GET /platform/iam with optional school_id filter', async () => {
    const res = await request(app())
      .get('/platform/iam?page=1&page_size=10&school_id=20000000-0000-4000-8000-000000000001')
      .expect(200);

    expect(res.body.success).toBe(true);
    expect(res.body.data).toHaveLength(1);
    expect(fixture.rpcHandler).toHaveBeenCalledWith(
      'platform_get_iam',
      expect.objectContaining({
        p_limit: 10,
        p_offset: 0,
        p_school_id: '20000000-0000-4000-8000-000000000001',
      })
    );
  });

  it('supports GET /platform/iam without school_id (cross-school all schools)', async () => {
    const res = await request(app()).get('/platform/iam?page=1&page_size=30').expect(200);

    expect(res.body.success).toBe(true);
    expect(fixture.rpcHandler).toHaveBeenCalledWith(
      'platform_get_iam',
      expect.objectContaining({
        p_limit: 30,
        p_offset: 0,
        p_school_id: null,
      })
    );
  });

  it('updates membership status and supports portal roles via PATCH /platform/iam/:id', async () => {
    const res = await request(app())
      .patch('/platform/iam/30000000-0000-4000-8000-000000000001')
      .send({
        status: 'SUSPENDED',
        roles: ['PORTAL_TEACHER'],
      })
      .expect(200);

    expect(res.body.success).toBe(true);
    expect(fixture.rpcHandler).toHaveBeenCalledWith(
      'platform_update_membership',
      expect.objectContaining({
        p_id: '30000000-0000-4000-8000-000000000001',
        p_status: 'SUSPENDED',
        p_roles: ['PORTAL_TEACHER'],
      })
    );
  });

  it('returns 409 PORTAL_ACTIVE_RECENTLY when database blocks deactivating portal active within 3 months', async () => {
    fixture.rpcHandler.mockImplementation(async (name: string) => {
      if (name === 'is_platform_admin') return { data: true, error: null };
      if (name === 'platform_update_membership') {
        return {
          data: null,
          error: {
            code: '23514',
            message:
              'PORTAL_ACTIVE_RECENTLY: Hak akses Portal tidak dapat dinonaktifkan karena pengguna masih aktif login dalam 3 bulan terakhir (terakhir login: 2026-10-31 08:00:00).',
          },
        };
      }
      return { data: null, error: null };
    });

    const res = await request(app())
      .patch('/platform/iam/30000000-0000-4000-8000-000000000001')
      .send({
        status: 'SUSPENDED',
        roles: ['PORTAL_TEACHER'],
      })
      .expect(409);

    expect(res.body.error.code).toBe('PORTAL_ACTIVE_RECENTLY');
    expect(res.body.error.message).toContain('3 bulan terakhir');
  });

  it('deletes user membership via DELETE /platform/iam/:id calling platform_delete_school_user', async () => {
    const res = await request(app())
      .delete('/platform/iam/30000000-0000-4000-8000-000000000001')
      .expect(200);

    expect(res.body.success).toBe(true);
    expect(fixture.rpcHandler).toHaveBeenCalledWith(
      'platform_delete_school_user',
      expect.objectContaining({
        p_id: '30000000-0000-4000-8000-000000000001',
      })
    );
  });

  it('returns 409 PORTAL_ACTIVE_RECENTLY when database blocks deleting portal active within 3 months', async () => {
    fixture.rpcHandler.mockImplementation(async (name: string) => {
      if (name === 'is_platform_admin') return { data: true, error: null };
      if (name === 'platform_delete_school_user') {
        return {
          data: null,
          error: {
            code: '23514',
            message:
              'PORTAL_ACTIVE_RECENTLY: Hak akses Portal tidak dapat dihapus karena pengguna masih aktif login dalam 3 bulan terakhir.',
          },
        };
      }
      return { data: null, error: null };
    });

    const res = await request(app())
      .delete('/platform/iam/30000000-0000-4000-8000-000000000001')
      .expect(409);

    expect(res.body.error.code).toBe('PORTAL_ACTIVE_RECENTLY');
  });
});

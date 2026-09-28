import { describe, expect, it } from 'vitest';
import { fromDatabaseError } from './errors.js';

describe('platform database readiness', () => {
  it('reports missing platform authority migration without bypassing authentication', () => {
    const error = fromDatabaseError({ code: 'PGRST202', message: 'Could not find the function public.is_platform_admin without parameters in the schema cache', details: '', hint: '' });
    expect(error.status).toBe(503);
    expect(error.code).toBe('DATABASE_NOT_READY');
    expect(error.message).toContain('migrasi Super Admin');
  });
  it('does not misdiagnose unrelated database failures as missing platform migrations', () => {
    expect(fromDatabaseError({ code: 'XX000', message: 'Database failed', details: '', hint: '' }).code).toBe('DATABASE_ERROR');
  });
});

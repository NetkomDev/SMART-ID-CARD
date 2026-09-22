# Supabase integration tests

Phase 11 uses a transactional PostgreSQL integration test. It creates two deterministic school fixtures, exercises the production `ingest_library_visit` RPC and RLS policies, and always rolls the fixture back.

## Prerequisites

1. Use a disposable Supabase/PostgreSQL database, never production.
2. Apply all files in `supabase/migrations` in timestamp order.
3. Export its direct PostgreSQL connection string as `DATABASE_URL`.
4. Ensure `psql` is installed.

Run:

```bash
npm run test:db:library
```

The script stops on the first SQL error. A successful run proves:

- authenticated staff from school A and B only read their own `library_visits` rows through RLS;
- a device ID from school A cannot be authenticated with school B's secret;
- replaying the same event UUID returns `duplicate=true` without adding a visit or outbox event;
- the per-class aggregate exactly matches the two source transactions.

The fixed UUIDs are isolated inside a transaction followed by `ROLLBACK`, so repeated runs do not retain fixtures.

# AKSIS Admin Web — Phase 07

Responsive, installable PWA for school administrators. It intentionally uses the Core API rather than direct database access; API authorization and PostgreSQL RLS remain authoritative.

## Development

```bash
# Terminal 1
npm run dev

# Terminal 2
npm run dev:admin
```

Open `http://localhost:4173`. Vite proxies `/api` to the Core API on port 3000. For a separate deployment, set `VITE_API_BASE_URL` at build time.

## Security model

- Access and refresh tokens live in `sessionStorage`, not persistent browser storage, and are removed on logout/session failure.
- Every human business request carries the selected `X-School-Id`; the server validates active membership and RLS.
- Permission-aware navigation is a UX guard only. It never replaces API/RLS enforcement.
- The service worker explicitly excludes `/api/` requests, so tenant data is not stored in Cache Storage.
- No Supabase service-role credential is accepted by this application.

## Phase 07 states

Dashboard and data modules implement loading, empty, error, and permission-denied states. Current live modules are summary, students, classes, attendance, cards, and devices. Navigation entries for later roadmap phases show an explicit not-yet-available state rather than fake data.

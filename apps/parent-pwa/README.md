# AKSIS Parent PWA — Phase 08

Secure parent experience for claiming school-issued child links and viewing the linked child's current-day timeline. Run with `npm run dev:parent`; production build uses `npm run build:parent`.

The service worker never caches `/api/` traffic. Authorization comes from the authenticated session plus an active `parent_student_links` relationship—not a child ID in the URL.

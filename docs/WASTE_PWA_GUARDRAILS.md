# Waste PWA Logic Lock (Piket Sampah Guardrails)

## Core Directive
The logic for the Waste Management PWA (`apps/waste-pwa`) and its associated backend components is explicitly **LOCKED** as of October 2026. This application is stable and fully functional.

## Constraint Rules for Future Development
When making changes to other PWAs (e.g., Library PWA, Extracurricular PWA, Parent Portal) or backend systems:

1. **API Isolation (`apps/api/src/routes/waste.ts`)**
   - The waste route must NOT be modified to accommodate features of other PWAs. If another PWA needs similar functionality, duplicate or create a shared utility rather than risking regressions in the waste endpoints.

2. **Database Functions (`waste_dashboard`, `waste_transactions`)**
   - Do NOT alter the return signature of Supabase RPCs that the Waste PWA depends on, specifically `waste_dashboard`. 
   - Table schema modifications to `waste_transactions` must provide default values to prevent breaking the existing INSERT logic.

3. **Card Resolution Logic (`resolve_student_card`)**
   - The card scanning resolution logic (shared across PWAs) was recently updated to include `photo_url`. Any further enhancements (like adding parent info or medical records) to the shared `resolve_student_card` function MUST ensure that the output shape still natively satisfies the `Student` typescript interface expected by `apps/waste-pwa/src/main.ts`.

4. **Shared UI & State (`portal-ui.ts`, `portal-session.ts`)**
   - The Waste PWA relies on `PortalSession` with the role `"WASTE_STAFF"`. 
   - CSS variables and layout structures imported from `shared/portal-theme.css` must remain backward compatible so the Waste PWA's styling (like the 5-color conic gradient chart) doesn't break.

## Conclusion
If any future AI agent or developer intends to modify shared systems for the benefit of other platforms, they MUST run regression tests mentally against the Waste PWA flow before committing.

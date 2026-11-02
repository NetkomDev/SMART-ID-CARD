# AKSIS Shared Frontend Libraries

## Overview
Shared client modules, utilities, and styling tokens utilized across all AKSIS mobile PWAs, kiosk terminals, and administration consoles.

## Interface
- `DurableQueue<T>`: Client-side persistent offline queue with deduplication, atomic processing, and Web Locks integration.
- `QRCamera`: Unified camera lifecycle and QR decoding wrapper with auto-centering, flash feedback, and single-shot auto-stop.
- `NaturalVoice`: Speech synthesis controller prioritizing Indonesian localized voices with offline-ready speech state.
- `PortalSession`: Role-based portal session authenticator (`GATE_STAFF`, `WASTE_STAFF`, `TEACHER`, `LIBRARY_STAFF`).
- `ParentSession`: Family and student linking session manager.
- `StudentCache`: Offline student identity and card UID resolver.
- `isInstalled()` & `promptOrOfferInstall()`: Standardized PWA installation prompt flow.
- `portal-theme.css` & `scanner.css`: Shared design tokens, dialog styles, and camera reticle animations.

## Invariants
- Queue and cache keys must always be scoped by tenant (`school_id`) and operator (`staff_id`) to prevent cross-school data pollution.
- No secrets or service-role keys may be stored or imported into shared client code.
- Camera instances clean up video streams and tracks on window unload or hidden document visibility.

## Side Effects
- Reads and mutates `IndexedDB` and `localStorage`.
- Accesses media devices (`navigator.mediaDevices.getUserMedia`) and audio context.
- Emits synthetic touch feedback (`navigator.vibrate`).

## Verification
- Run: `npm test`

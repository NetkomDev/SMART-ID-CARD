# AKSIS Operations Console

## Overview
Administrative operations and reporting console for exporting comprehensive CSV snapshots across attendance, waste banking, library visits, and extracurricular activities.

## Interface
- `OperatorSession`: Session and authentication wrapper for system operators.
- `csv(rows)`: Client-side CSV generator formatting UTF-8 records with BOM header for spreadsheet compatibility.

## Invariants
- Exports verify record checksums against backend manifests before initiating file download (`manifest.checksum` SHA-256 validation).
- Uses paginated export chunks of 500 rows (`limit=500`) to prevent browser memory exhaustion.

## Side Effects
- Requests report export manifests and data pages via `/reports/exports`.
- Triggers browser blob file downloads for generated `.csv` files.

## Verification
- Run: `npm run build:operations && npm test`

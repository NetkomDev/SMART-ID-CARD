# Production Readiness and Operations

## Service objectives

| Signal | Objective | Alert |
| --- | --- | --- |
| Core API availability | 99.9% per 30 days | 5xx ratio > 2% for 5 minutes |
| Core API latency | p95 < 500 ms | p95 > 750 ms for 10 minutes |
| Gate/library ingestion | 99.9% accepted or deterministically rejected | ingest failure > 1% for 5 minutes |
| Dashboard freshness | < 2 minutes | snapshot stale > 5 minutes |
| Device heartbeat | expected interval + 2 minutes | device silent > 5 minutes |

The monthly error budget for a 99.9% availability objective is approximately 43 minutes. Freeze non-remediation releases when 75% is consumed and require an incident review at 100%.

## Logging, metrics, and tracing

- Ship JSON API logs from stdout to the centralized platform. `x-request-id` is the trace/correlation key and must propagate through proxies.
- Scrape `/api/v1/monitoring/metrics` using a dedicated identity with `monitoring.read`; never expose it publicly.
- Alert on API errors/latency, database saturation, RLS denial anomalies, stale dashboards, failed device acknowledgements, and backup failures.
- Redact authorization, passwords, refresh tokens, device secrets, card QR keys, and personal payloads before export.

## Incident response

1. Declare severity and incident commander; preserve request IDs and the append-only audit trail.
2. Contain with tenant feature flags, credential revocation, or write-path disablement. Do not disable RLS.
3. Validate tenant scope before querying/exporting evidence.
4. Restore service, reconcile source transactions to reports, and notify affected owners under the privacy policy.
5. Publish a blameless review with timeline, root cause, corrective actions, and owners.

## Backup and disaster recovery

- Target **RPO ≤ 15 minutes** and **RTO ≤ 4 hours** for production.
- Enable provider PITR and daily encrypted backups in a separate failure domain.
- Quarterly: restore the latest backup into an isolated project, apply integrity/RLS smoke tests, reconcile tenant counts, record achieved RPO/RTO, and destroy the drill environment.
- Never treat a configured backup as verified until a restore drill succeeds.

## Privacy, retention, and exports

- Configure `data_retention_policies` per tenant and category; deletion workers must honor legal holds.
- Reports and CSV exports are permission-checked, tenant-scoped, and must be handled as personal data.
- Audit logs are append-only; retention deletion requires an approved service-role job and preserved evidence of the approval.
- Fulfil ownership/export requests using documented scope, requester verification, encryption in transit, and expiring download links.

## Production sign-off checklist

- [ ] All migrations and two-tenant RLS suites pass in staging.
- [ ] Report reconciliation matches attendance, waste, library, and extracurricular source transactions.
- [ ] Security review and penetration test have no unresolved critical/high findings.
- [ ] Load tests meet latency and ingestion SLOs at arrival-hour traffic.
- [ ] Alert routes are tested and actionable; on-call ownership is current.
- [ ] Backup restore and regional disaster-recovery drills meet RPO/RTO.
- [ ] Retention/privacy and data export review are approved.
- [ ] Device rollback, credential revocation, and incident runbooks are exercised.

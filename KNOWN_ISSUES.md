# Known Issues

## Confirmed High-Impact Gaps

- Lip-sync provider behavior remains less complete than STT, translation, and
  TTS. The repo now has real OpenAI-backed provider paths for those three
  stages, but lip-sync still trails the rest of the pipeline.
- Provider quality hardening is still early-stage. The first real provider slice
  exists, but fallback depth, quality tuning, and broader provider coverage are
  still limited.

## Confirmed Operational Gaps

- Worker deployment is now repo-committed at the process level
  Health checks, heartbeat logs, and stuck-job tooling now exist, but
  production supervision, autoscaling, and platform-specific rollout guidance
  are still not committed.
- There is still no external metrics, tracing, or alerting backend.
- Stuck-job detection exists, but automatic stuck-job remediation does not.

## Confirmed State / Pipeline Fragility

- Lip-sync request handling can still temporarily mark states inconsistently
  before reconciliation normalizes the terminal status.
- Terminal credit handling depends on `reconcileJobOutputs()`; avoid bypassing it
  when changing pipeline logic.

## Confirmed Billing / Credits Risks

- Credit reservation depends on the database RPC
  `create_job_with_credit_reservation`; do not replace it casually with ad hoc
  multi-step application logic.
- Credit balance semantics are ledger-derived, not materialized as a profile
  balance field.
- Stripe webhook handling is idempotent at the event-storage layer, but any
  future credit logic changes should preserve duplicate-event safety.

## Architecture Ambiguities

- Existing docs historically described a fuller production architecture than the
  current code actually implements.
- `SYSTEM_DIAGRAM.md` may be useful as reference, but the code should be treated
  as the source of truth.

## Things Not to Change Casually

- Job and target status names in `types/jobs.ts` and `lib/jobs/jobStates.ts`
- `credit_ledger` accounting semantics
- Supabase RPC `create_job_with_credit_reservation`
- Webhook secret validation behavior
- Pipeline ordering in `processJob()`
- Transcript edit preference for `edited_source_text`

## Recommended Safe Areas for Iteration

- Add provider depth and fallback handling beyond the first real OpenAI paths
- Add deployment-platform health checks, supervision, and rollout guidance
- Add optional UI polling/auto-refresh for long-running job updates

## Top 5 Architectural Risks

1. Source-media path handling now depends on worker-side staging and cleanup
   behaving correctly across environments with FFmpeg and writable disk.
2. Worker operations are now packaged, but production supervision and rollout
   strategy are still under-specified.
3. Provider coverage is uneven because lip-sync still lags behind the rest of
   the now-real STT/translation/TTS path.
4. Observability is still primarily log/script based without external metrics or
   tracing.
5. Terminal credit handling depends on reconciliation staying authoritative, so
   future pipeline changes can still regress correctness if they bypass it.

## Top 5 Next Implementation Priorities

1. Deepen lip-sync provider behavior so it matches the rest of the pipeline.
2. Add deployment-platform supervision, rollout, and scaling guidance.
3. Add external metrics/tracing or equivalent observability.
4. Add automatic stuck-job remediation and/or stronger recovery tooling.
5. Expand provider coverage and operational fallbacks beyond the first OpenAI
   integration slice.

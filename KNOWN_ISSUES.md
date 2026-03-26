# Known Issues

## Confirmed High-Impact Gaps

- Provider integrations are mostly placeholders
  STT, translation, TTS, and lip-sync layers only support `mock` or
  `not configured` behavior.

- Lip-sync output is not yet durably persisted back to Supabase Storage

- Worker deployment is still repo-local
  The repo now has a worker runtime and entrypoint, but no committed production
  deployment packaging or service definition.

## Confirmed UI Gaps

- Dashboard recent jobs are mock data.
- Job detail page metadata and artifact list are mock data.
- Transcript editor is real, which means the job detail page is only partially
  live and can be misleading.

## Confirmed State / Pipeline Fragility

- Translation step currently fails hard on the first target translation error,
  despite the broader design aiming for partial success behavior.
- Lip-sync request handling can temporarily mark states inconsistently before
  reconciliation normalizes the terminal status.
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

- Replace mock UI sections with live queries
- Add concrete provider adapters behind existing interfaces
- Add structured logging
- Add durable lip-sync artifact storage

## Top 5 Architectural Risks

1. Source-media path handling is inconsistent across upload and processing paths,
   but now depends on worker-side local staging and cleanup behaving correctly.
2. Lip-sync durable artifact persistence is still incomplete, leaving the output
   model inconsistent across artifact types.
3. Partial-success behavior is not implemented consistently across all stages,
   especially translation failure handling.
4. Provider integrations are still mostly mock or not configured.
5. Worker deployment/operations are still under-specified for production use.

## Top 5 Next Implementation Priorities

1. Persist lip-sync outputs durably and store those durable paths.
2. Improve partial-success correctness across target-level failures.
3. Replace mock dashboard/job-detail job data with live reads from jobs and
   job_targets.
4. Add worker deployment packaging/instructions for a production runtime.
5. Add at least one real provider integration behind the existing mock provider
   interfaces, plus structured logging around step execution.

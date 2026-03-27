# Known Issues

## Confirmed High-Impact Gaps

- Lip-sync output is not yet durably persisted back to Supabase Storage

- Lip-sync provider behavior remains less complete than STT, translation, and
  TTS. The repo now has first real OpenAI-backed provider paths for those three
  stages, but lip-sync still trails the rest of the pipeline.

## Confirmed Operational Gaps

- Worker deployment is now repo-committed at the process level
  Scripts and Procfiles exist, but production hardening such as health checks,
  supervised restarts, and platform-specific rollout guidance is still not
  committed.

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

- Add durable lip-sync artifact storage
- Add provider depth and fallback handling beyond the first real OpenAI paths
- Add deployment-platform health checks and supervision guidance

## Top 5 Architectural Risks

1. Source-media path handling is inconsistent across upload and processing paths,
   but now depends on worker-side local staging and cleanup behaving correctly.
2. Lip-sync durable artifact persistence is still incomplete, leaving the output
   model inconsistent across artifact types.
3. Worker operations are now packaged, but production supervision and health
   strategy are still under-specified.
4. Provider coverage is uneven because lip-sync still lags behind the rest of
   the now-real STT/translation/TTS path.
5. Terminal credit handling depends on reconciliation staying authoritative, so
   future pipeline changes can still regress correctness if they bypass it.

## Top 5 Next Implementation Priorities

1. Persist lip-sync outputs durably and store those durable paths.
2. Deepen lip-sync provider behavior so it matches the rest of the pipeline.
3. Add retry and cancellation orchestration.
4. Add production health checks and service-supervision guidance for the worker.
5. Expand provider coverage and operational fallbacks beyond the first OpenAI
   integration slice.

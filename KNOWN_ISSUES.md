# Known Issues

## Confirmed High-Impact Gaps

- No actual worker runtime
  `processJob()` and `worker/handlers/process-media-job.ts` exist, but nothing
  in the repo queues or executes jobs in the background.

- Storage-path vs filesystem-path mismatch
  Job creation stores Supabase Storage paths such as
  `uploads/{userId}/{uploadId}/source.ext`, while FFmpeg processing expects a
  directly readable local path.

- Generated outputs are not persisted durably
  Subtitle and dubbed-audio steps write local files. There is no upload-back to
  Supabase Storage.

- Provider integrations are mostly placeholders
  STT, translation, TTS, and lip-sync layers only support `mock` or
  `not configured` behavior.

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

- `lib/db/*` expects a generic SQL executor, but no concrete executor
  implementation is present in the repo for worker usage.
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
- Add worker bootstrapping / queue integration
- Add structured logging
- Add durable artifact storage

## Top 5 Architectural Risks

1. Source-media path handling is inconsistent across upload and processing paths,
   so the pipeline cannot reliably run end-to-end in production.
2. There is no queue-backed worker runtime, so jobs can be created but not
   automatically processed.
3. Generated outputs are written only to local disk, creating durability and
   multi-instance execution risk.
4. Partial-success behavior is not implemented consistently across all stages,
   especially translation failure handling.
5. The worker-oriented DB abstraction is incomplete in this repo because no
   concrete `DatabaseExecutor` implementation is provided.

## Top 5 Next Implementation Priorities

1. Add a real worker runtime and queue mechanism that can move jobs from
   `created` to `queued` to `processJob()`.
2. Resolve media access by downloading or mounting source files before FFmpeg
   steps run.
3. Persist generated subtitles, dubbed audio, and lip-sync outputs to durable
   storage and store those durable paths.
4. Replace mock dashboard/job-detail job data with live reads from jobs and
   job_targets.
5. Add at least one real provider integration behind the existing mock provider
   interfaces, plus structured logging around step execution.

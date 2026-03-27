# Media Translator Architecture

## Overview

Confirmed facts:

Media Translator is a Next.js application for creating media-translation jobs,
tracking billing credits, editing transcripts, and eventually producing one of
three output modes per job:

- `subtitles`
- `dubbed_audio`
- `lip_sync`

The repository currently contains the application shell, API routes, database
schema, billing flows, transcript editing, processing-step implementations, and
a worker runtime, worker handler entry point, source-media staging, and durable
artifact upload-back to Supabase Storage. It also contains first real OpenAI
provider paths for STT, translation, and TTS, durable lip-sync artifact
persistence, cancel/retry orchestration, validation tooling, and committed
web/worker process packaging.

Assumption:

- The intended long-term shape remains an app plus a separate worker/runtime,
  with deployment-platform-specific hardening left to the target environment.

## Main Components

### Frontend

- `app/page.tsx`
  Upload-first entry page. Initializes uploads, uploads the source file to
  Supabase Storage from the browser, then creates a job.
- `app/dashboard/page.tsx`
  Dashboard with upload flow, billing summary, and live recent jobs.
- `app/dashboard/billing/page.tsx`
  Billing page backed by live billing status.
- `app/dashboard/jobs/[jobId]/page.tsx`
  Job detail page with live metadata, artifact reads, progress timeline, and a
  real transcript editor panel.
- `components/transcript-editor-panel.tsx`
  Real transcript fetch/save UI against `/api/jobs/[jobId]/transcript`.
- `components/billing-status-panel.tsx`
  Client-side fetch of live Stripe/Supabase billing status.
- `components/job-progress-timeline.tsx`
  UI-only rendering of job states.

### API Layer

Thin Next.js route handlers in `app/api/*` validate JSON/auth and delegate to
`lib/` modules:

- `/api/uploads/init`
- `/api/jobs/create`
- `/api/jobs/[jobId]/transcript`
- `/api/billing/status`
- `/api/stripe/create-checkout-session`
- `/api/stripe/webhook`
- `/api/webhooks/lipsync`

### Domain Logic in `lib/`

- `lib/storage/*`
  Upload path generation and client upload orchestration.
- `lib/jobs/*`
  Job creation, enqueueing, orchestration, reconciliation, state handling, and
  webhook handling.
- `lib/jobs/steps/*`
  Individual pipeline stages.
- `lib/credits/*`
  Credit estimation and ledger-oriented accounting helpers.
- `lib/billing/*`
  Stripe checkout, webhook processing, and billing status aggregation.
- `lib/transcript/*`
  Transcript read/update behavior.
- `lib/db/*`
  SQL-oriented helper functions built around a generic `DatabaseExecutor`
  abstraction.
- `lib/ai/*`
  Provider abstraction layers for transcription, translation, TTS, and lip-sync.
- `lib/ffmpeg/*`
  Media normalization and audio extraction.

### Data Layer

- Supabase Postgres for relational state
- Supabase Storage for uploaded source media
- Supabase Storage for durable generated artifacts
- Stripe for billing/subscription state
- Worker-local filesystem staging for temporary processing artifacts

## External Services

- Supabase Auth
  Browser session access token is sent to API routes; server validates it via
  `supabase.auth.getUser`.
- Supabase Storage
  Source files are uploaded to `media/uploads/{userId}/{uploadId}/source.ext`.
- Stripe
  Used for Checkout, subscription lookup, and webhook-based credit grants.
- FFmpeg
  Required by normalization and audio extraction steps.
- AI providers
  Abstracted behind `lib/ai/*`. Current code supports real OpenAI-backed STT,
  translation, and TTS, plus env-selectable `mock` fallbacks. Lip-sync still
  uses its separate request/webhook flow and remains the least mature provider
  slice.

## Data Flow

### Upload and Job Creation

1. Browser requests `/api/uploads/init`.
2. Server validates file metadata and returns a server-owned storage path.
3. Browser uploads directly to Supabase Storage using the authenticated browser
   Supabase client.
4. Browser calls `/api/jobs/create`.
5. Server validates ownership, duration, mode, targets, and credits.
6. Supabase RPC `create_job_with_credit_reservation` creates the job,
   job_targets, and reserve ledger entry.

### Processing

1. The worker runtime polls jobs, moves claimable work from `created` to
   `queued`, and executes `processJob()`.
2. `processJob()` stages source media locally, then runs normalize -> extract
   audio -> transcribe -> translate ->
   subtitles -> dubbed audio -> lip-sync request.
3. Processing uploads durable generated artifacts back to Supabase Storage and
   updates job/target rows with storage object paths.
4. Final status and credit release/finalization are derived by
   `reconcileJobOutputs()`.
5. Lip-sync completion arrives later via webhook, which also durably persists
   the final lip-sync output before reconciliation runs.

### Billing

1. Authenticated client calls checkout-session route with a plan name.
2. Server ensures a Stripe customer and creates a hosted subscription checkout.
3. Stripe webhook stores each event in `billing_events`.
4. `invoice.paid` grants plan credits into `credit_ledger`.
5. Billing status API combines Stripe subscription data with ledger balance.

## Boundaries and Separation of Concerns

- UI components should remain presentational or thin data-fetching clients.
- API routes are intentionally thin.
- Business logic belongs in `lib/`.
- Media processing belongs in processing modules / worker path, not routes.
- DB schema changes belong in SQL migrations.
- Credit accounting must be append-only via `credit_ledger`.

## Important Current Boundaries

Confirmed facts:

- The generic SQL helpers in `lib/db/*` are designed for a database executor,
  and the worker now includes a concrete Postgres-backed executor.
- Processing uses worker-local files as temporary working artifacts, but durable
  outputs are uploaded back into Supabase Storage.
- The dashboard and job detail routes now read live job data, while keeping UI
  concerns separate from `lib/` read helpers.
- Cancel and retry are now implemented as thin route/UI actions over worker-owned
  orchestration: cancel is cooperative, and retry creates a new job attempt
  instead of rewinding the original job.

## Code/Doc Inconsistencies Flagged

- The previous `PIPELINE.md` did not describe the actual pipeline at all.
- Existing docs implied no queue consumer/runtime, but the repo now has a
  worker poller plus worker entrypoint.
- Existing docs implied the worker lacked repo-committed process packaging, but
  the repo now includes explicit web/worker scripts plus `Procfile.dev` and
  `Procfile`.
- Existing docs also understated dashboard/job-detail live data, cancellation /
  retry support, durable lip-sync output persistence, and validation coverage.

# Project Context

## Purpose

Confirmed fact:

Media Translator is a SaaS-style application for turning uploaded audio/video
into translated outputs in one target mode per job:

- subtitles
- dubbed audio
- lip-sync video

The codebase is structured to support architecture review, pipeline work,
billing/credits, and staged implementation of media-processing features.

## Target Users

Assumption inferred from product shape, not directly encoded in the repo:

- Creators localizing short media clips
- Small teams translating product, marketing, or support videos
- Internal operators/developers validating processing and billing flows

## Current Product Scope

Confirmed facts from code and schema:

- Max media duration: 5 minutes
- Single output mode per job
- Multiple target languages per job
- Source upload via Supabase Storage
- Transcript editing before translation
- Billing via Stripe subscriptions and credit ledger

## Tech Stack

Confirmed facts from `package.json` and implementation:

- Next.js App Router
- React 19
- TypeScript
- Tailwind CSS v4
- Supabase Auth, Postgres, Storage
- Stripe
- FFmpeg

## Supabase / DB / Storage / Auth Usage

Confirmed facts:

- Auth
  Browser session token is passed to API routes in `Authorization: Bearer ...`.
- Database
  Supabase Postgres stores profiles, plans, jobs, targets, transcript segments,
  translated segments, billing events, and credit ledger entries.
- Storage
  Source uploads go to Supabase Storage bucket `media`.
- Admin access
  Most server logic uses the Supabase service-role client.

## Already Implemented

Confirmed facts:

- Initial database schema and job-creation RPC migration
- Upload init route and browser upload flow
- Job creation with credit reservation
- Credit calculation and ledger helpers
- Billing status API and Stripe Checkout route
- Stripe webhook storage and credit grant logic
- Transcript fetch/edit API and transcript editor UI
- FFmpeg normalization and audio extraction utilities
- Worker runtime / poller plus worker entrypoint scripts
- Concrete worker-side Postgres executor wired through `withPostgresClient()`
- Source-media staging from Supabase Storage to worker-local disk before FFmpeg
- Real OpenAI-backed STT, translation, and TTS provider paths plus env-selectable
  mock fallbacks
- Provider abstraction layers for STT, translation, TTS, and lip-sync
- Job step implementations for transcription, translation, subtitles, dubbed
  audio, and lip-sync request
- Durable upload-back of normalized media, extracted audio, subtitles, and
  dubbed audio to Supabase Storage
- Durable upload-back of lip-sync outputs to Supabase Storage
- Final reconciliation logic for terminal job status and credit release/finalize
- Lip-sync webhook handler
- Cooperative cancellation plus retry-as-new-attempt orchestration
- Live dashboard recent jobs and live job-detail metadata/artifact reads
- Dashboard-hosted upload/job-creation flow
- UI-level cancel/retry actions on the job detail page
- Health endpoint, worker heartbeat logging, and stuck-job tooling
- Focused validation suite for completed / partial_success / failed / canceled /
  retry-as-new-attempt outcomes

## Not Yet Implemented or Not Fully Wired

Confirmed facts:

- Lip-sync provider behavior is still less mature than the STT / translation /
  TTS path
- Automatic retry/backoff is still not implemented
- Cooperative cancellation is not a force-kill mechanism for in-flight FFmpeg
  or provider work
- There is still no external metrics/tracing backend
- Stuck-job visibility exists, but automatic stuck-job remediation does not
- Deployment is documented at the process level, but cloud/platform-specific
  rollout, supervision, and scaling config are still not committed
- `app/page.tsx` is still an upload-first entry page, not a separate marketing
  landing page

## Key Constraints

Confirmed facts from code and repository guidance:

- Heavy processing must not run in API routes
- Credit accounting must stay ledger-based
- One output mode per job
- Media duration limit is 5 minutes
- Lip-sync requires video input
- Modules are intended to stay small and focused

## Recommended Next Priorities

This section is a recommendation based on repository state, not an existing
tracked priority list in code:

- Replace stale docs with implementation-accurate docs
- Deepen provider quality/fallback handling, especially around lip-sync
- Add deployment-platform-specific supervision, rollout, and autoscaling
  guidance
- Add stronger observability beyond structured logs and scripts
- Add optional UI auto-refresh/polling for long-running job status changes
- Build the still-missing marketing landing page if product-launch positioning
  matters

## Major Implementation Reality Checks

Confirmed facts:

- The app can create jobs and the worker can now auto-process them.
- The worker now stages source media locally before FFmpeg runs.
- The worker now uploads generated artifacts back to Supabase Storage for
  durable persistence.
- The codebase is still a blend of application shell, worker pipeline, and
  operational tooling rather than a fully platform-hardened production system.

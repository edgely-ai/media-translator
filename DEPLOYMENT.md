# Deployment Notes

## Current Deployment Shape

Confirmed facts:

- The repo contains a Next.js app, Supabase integrations, Stripe integrations,
  and processing modules that require FFmpeg.
- The repo now contains a worker entrypoint and runtime, committed process
  files, and package scripts for running the web app and worker as separate
  long-lived processes.

Assumption:

This repository is closest to a two-process deployment plus external managed
services:

- Next.js web service
- worker service
- Supabase project
- Stripe account/webhooks
- FFmpeg available on the runtime that executes processing

There is still no cloud-vendor-specific deployment config in the repository.
The committed shape is process-level packaging: `Procfile.dev` for local
development and `Procfile` for web/worker service commands. The repo now also
includes a Render Blueprint in `render.yaml` for a web service plus background
worker deployment on Render.

## Environments

Assumption, not confirmed by committed environment config:

Expected environment split:

- local development
- preview/staging
- production

The code does not currently provide environment-specific config files beyond
runtime environment variables.

## Environment Variables in Use

Supabase:

- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- `SUPABASE_SERVICE_ROLE_KEY`

Stripe:

- `STRIPE_SECRET_KEY`
- `STRIPE_WEBHOOK_SECRET`

Lip-sync webhook:

- `LIPSYNC_WEBHOOK_SECRET`

Provider selection / local mocks:

- `TRANSCRIPTION_PROVIDER`
- `TRANSCRIPTION_MOCK_TEXT`
- `TRANSLATION_PROVIDER`
- `TRANSLATION_MOCK_PREFIX`
- `TTS_PROVIDER`
- `LIPSYNC_PROVIDER`
- `OPENAI_API_KEY`
- `OPENAI_BASE_URL`
- `OPENAI_TRANSCRIPTION_MODEL`
- `OPENAI_TRANSLATION_MODEL`
- `OPENAI_TTS_MODEL`
- `OPENAI_TTS_VOICE`

Database:

- `DATABASE_URL`

Worker runtime:

- `WORKER_POLL_INTERVAL_MS`
- `WORKER_HEARTBEAT_INTERVAL_MS`
- `WORKER_QUEUED_SCAN_LIMIT`
- `WORKER_OUTPUT_ROOT_DIR`
- `WORKER_STAGING_ROOT`
- `WORKER_LIPSYNC_CALLBACK_URL`
- `WORKER_STUCK_JOB_THRESHOLD_MS`
- `WORKER_STUCK_JOB_SAMPLE_LIMIT`

## Hosting Assumptions

### Next.js

Confirmed facts:

- Needs server-side access to Supabase service-role credentials
- Needs outbound network access to Supabase and Stripe
- API routes depend on bearer-token auth from Supabase browser sessions
- Exposes a lightweight health route at `/api/health`

### Processing Runtime

Confirmed facts based on current code path:

The worker runtime must provide:

- `ffmpeg` on `PATH`
- writable local disk for worker staging and output directories
- access to the Supabase-backed source object and credentials to stage it locally
- outbound network access to provider APIs and Supabase Storage

## Local Development Pattern

Committed dev-run pattern:

1. Install dependencies with `npm install`.
2. Start the web app with `npm run dev:web`.
3. Start the worker in a second terminal with `npm run dev:worker`.

Alternative:

- Use `Procfile.dev` with a Procfile-compatible process manager to run `web`
  and `worker` together.

Expected behavior:

- The web app handles auth, uploads, billing routes, and job creation.
- The worker polls claimable jobs, stages source media locally, runs processing,
  uploads durable artifacts back to Supabase Storage, and then reconciles final
  job state.
- The worker emits structured lifecycle logs and periodic heartbeat logs while
  it is running.

## Render Blueprint

Committed Render Blueprint:

- `render.yaml`

Service model:

- `media-translator-web`
  Render Web Service using `npm run build`, `npm run start`, and
  `healthCheckPath: /api/health`
- `media-translator-worker`
  Render Background Worker using `npm run build`, `npm run worker`, and
  `maxShutdownDelaySeconds: 120`

Both services are explicitly set to `plan: starter` in the Blueprint so the
first Render deploy is less ambiguous.

The Blueprint intentionally keeps Supabase external:

- external Supabase Postgres via `DATABASE_URL`
- external Supabase Storage/Auth via the existing URL/keys

### Render Environment Split

Shared to both services where applicable:

- `DATABASE_URL`
- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- `SUPABASE_SERVICE_ROLE_KEY`

Web only:

- `STRIPE_SECRET_KEY`
- `STRIPE_WEBHOOK_SECRET`
- `LIPSYNC_WEBHOOK_SECRET`
- optional `GIT_COMMIT_SHA`

Worker only:

- `TRANSCRIPTION_PROVIDER`
- `TRANSCRIPTION_MOCK_TEXT`
- `TRANSLATION_PROVIDER`
- `TRANSLATION_MOCK_PREFIX`
- `TTS_PROVIDER`
- `LIPSYNC_PROVIDER`
- `OPENAI_API_KEY`
- `OPENAI_BASE_URL`
- `OPENAI_TRANSCRIPTION_MODEL`
- `OPENAI_TRANSCRIPTION_PROMPT`
- `OPENAI_TRANSLATION_MODEL`
- `OPENAI_TTS_MODEL`
- `OPENAI_TTS_VOICE`
- `WORKER_POLL_INTERVAL_MS`
- `WORKER_HEARTBEAT_INTERVAL_MS`
- `WORKER_QUEUED_SCAN_LIMIT`
- `WORKER_OUTPUT_ROOT_DIR`
- `WORKER_STAGING_ROOT`
- `WORKER_LIPSYNC_CALLBACK_URL`
- `WORKER_STUCK_JOB_THRESHOLD_MS`
- `WORKER_STUCK_JOB_SAMPLE_LIMIT`

### Render-Specific Notes

- Render should use the existing health route at `/api/health` for the web
  service.
- The worker remains a long-lived poller; it is not a job-runner route.
- Worker-local disk is ephemeral. The Blueprint defaults the worker to `/tmp`
  paths for staging and output, while durable artifacts remain in Supabase
  Storage.
- The worker start command uses `npm run worker`, so `tsx` must remain
  available at runtime.
- The worker also runs `npm run build`, so it must receive any build-time
  `NEXT_PUBLIC_*` vars used by the Next.js app even when those vars are mainly
  needed by the web service at runtime.
- `WORKER_LIPSYNC_CALLBACK_URL` should be set to the public Render web URL plus
  `/api/webhooks/lipsync` when a non-mock lip-sync provider is enabled.

## Worker / Function Topology

Implemented:

- Next.js API routes
- library-based job processor
- worker handler wrapper in `worker/handlers/process-media-job.ts`
- worker runtime / poller
- worker process entrypoint in `worker/main.ts`
- committed `Procfile.dev` and `Procfile` with separate `web` and `worker`
  commands

## Production Risks

- The worker now stages source files locally before FFmpeg executes, but this
  still depends on local disk availability and correct service-role access.
- Durable persistence now exists for normalized media, extracted audio,
  subtitles, dubbed audio, and lip-sync outputs.
- Real OpenAI-backed STT, translation, and TTS paths now exist, but provider
  selection still depends on explicit env configuration and lip-sync remains a
  separate, less mature provider slice.
- Service-role Supabase access is widely used; route boundaries matter.
- Billing and lip-sync webhooks require externally configured secrets.
- The committed process model is intentionally lightweight; health checks,
  supervised restarts, autoscaling, and alerting remain deployment-platform
  concerns.
- Stuck-job visibility is log/script driven rather than automatic remediation.
- Render wiring is now committed, but platform-specific domains, rollout
  strategy, and secret management still need to be completed in the Render
  dashboard/workspace.

## Operational Recommendations

Current recommended service model:

- Build the app once with `npm run build`.
- Run the web service with `npm run start`.
- Run the worker service separately with `npm run worker`.
- Give both processes the same shared app env, and give the worker FFmpeg plus
  writable local staging/output directories.

Startup and shutdown expectations:

- The worker is a long-lived poller, not a route-triggered job runner.
- The runtime already handles `SIGINT` and `SIGTERM`, stops polling, closes the
  Postgres pool, and exits after the active loop finishes.
- The runtime emits `worker_runtime_started`, periodic `worker_heartbeat`, and
  `worker_runtime_stopped` events.

Health and routine checks:

- Web liveness: `GET /api/health`
- Worker env summary: `npm run ops:check-worker-env`
- Potentially stuck jobs: `npm run ops:stuck-jobs`
- Heartbeat warnings for aged active jobs are emitted from the worker when the
  configured stuck-job threshold is exceeded.

Still recommended next work:

- Add health checks and service supervision guidance for the chosen deployment
  platform.
- Add external metrics/tracing if the deployment platform needs deeper
  observability than structured logs.
- Add platform-specific rollout/runbook guidance once the target hosting setup
  is chosen.

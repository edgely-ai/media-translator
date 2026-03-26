# Deployment Notes

## Current Deployment Shape

Confirmed facts:

- The repo contains a Next.js app, Supabase integrations, Stripe integrations,
  and processing modules that require FFmpeg.
- The repo now contains a worker entrypoint and runtime, but still does not
  contain committed worker deployment config.

Assumption:

This repository is closest to a single Next.js application deployment plus
external managed services:

- Next.js app server
- Supabase project
- Stripe account/webhooks
- FFmpeg available on the runtime that would execute processing

There is no committed deployment config for Vercel, Docker, or a separate worker
service in the current repository.

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

## Hosting Assumptions

### Next.js

Confirmed facts:

- Needs server-side access to Supabase service-role credentials
- Needs outbound network access to Supabase and Stripe
- API routes depend on bearer-token auth from Supabase browser sessions

### Processing Runtime

Assumption based on current code path:

If processing is executed from this codebase, the runtime must also provide:

- `ffmpeg` on `PATH`
- writable local disk for `media/{jobId}/...`
- access to the source media path as a real local file
- access to the Supabase-backed source object and credentials to stage it locally

## Worker / Function Topology

Implemented:

- Next.js API routes
- library-based job processor
- worker handler wrapper in `worker/handlers/process-media-job.ts`
- worker runtime / poller
- worker process entrypoint in `worker/main.ts`

Missing:

- background queue
- deployment instructions for a worker service

## Production Risks

- The worker now stages source files locally before FFmpeg executes, but this
  still depends on local disk availability and correct service-role access.
- Durable persistence now exists for normalized media, extracted audio,
  subtitles, and dubbed audio, but lip-sync output durability is still a gap.
- Provider layers default to `not configured` unless explicitly set to `mock`.
- Service-role Supabase access is widely used; route boundaries matter.
- Billing and lip-sync webhooks require externally configured secrets.

## Operational Recommendations

Recommended next operational work, not currently implemented:

- Treat current processing code as library/runtime logic, not a complete
  production deployment.
- Add a real worker service before enabling automatic job processing.
- Add deployment packaging/instructions for the worker service.
- Add durable persistence for lip-sync outputs.
- Add structured logging before debugging production pipeline failures.

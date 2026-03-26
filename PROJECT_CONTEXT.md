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
- Provider abstraction layers for STT, translation, TTS, and lip-sync
- Job step implementations for transcription, translation, subtitles, dubbed
  audio, and lip-sync request
- Durable upload-back of normalized media, extracted audio, subtitles, and
  dubbed audio to Supabase Storage
- Final reconciliation logic for terminal job status and credit release/finalize
- Lip-sync webhook handler

## Not Yet Implemented or Not Fully Wired

Confirmed facts:

- No real AI provider integrations beyond `mock`/`not configured`
- Dashboard recent jobs and job detail metadata are still mock data
- No cancellation flow
- No retry orchestration beyond manual reruns
- No deployment configuration files in repo
- No admin/dev scripts beyond `scripts/reliability-matrix.md`
- Durable persistence for lip-sync output is still not implemented in the
  current code

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
- Replace mock UI sections with live job queries
- Add real provider integrations and operational logging
- Add durable persistence for lip-sync outputs
- Add deployment packaging/instructions for the worker service

## Major Implementation Reality Checks

Confirmed facts:

- The app can create jobs, but it does not currently auto-process them.
- The worker now stages source media locally before FFmpeg runs.
- The worker now uploads generated artifacts back to Supabase Storage for
  durable persistence.
- The codebase is part prototype, part application shell, and part pipeline
  library.

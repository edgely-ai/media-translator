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
- Provider abstraction layers for STT, translation, TTS, and lip-sync
- Job step implementations for transcription, translation, subtitles, dubbed
  audio, and lip-sync request
- Final reconciliation logic for terminal job status and credit release/finalize
- Lip-sync webhook handler

## Not Yet Implemented or Not Fully Wired

Confirmed facts:

- No production worker runtime or queue consumer
- No concrete DB executor wired into the worker path
- No real AI provider integrations beyond `mock`/`not configured`
- No download/storage sync of generated artifacts back to Supabase Storage
- Dashboard recent jobs and job detail metadata are still mock data
- No cancellation flow
- No retry orchestration beyond manual reruns
- No deployment configuration files in repo
- No admin/dev scripts beyond `scripts/reliability-matrix.md`

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
- Wire a real worker/runtime around `processJob`
- Resolve storage-path vs local-file-path assumptions in processing
- Replace mock UI sections with live job queries
- Add real provider integrations and operational logging

## Major Implementation Reality Checks

Confirmed facts:

- The app can create jobs, but it does not currently auto-process them.
- The processing modules assume direct filesystem access to media paths.
- The upload path stored in jobs is a Supabase Storage path, not a downloaded
  local file path.
- The codebase is part prototype, part application shell, and part pipeline
  library.

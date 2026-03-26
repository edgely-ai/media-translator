# Media Translator — Task Backlog

This file contains the implementation backlog for Media Translator.

Coding agents should:

1. read AGENTS.md
2. read ARCHITECTURE.md
3. read PIPELINE.md
4. read CONSTRAINTS.md
5. then execute tasks from this file in order unless instructed otherwise

Each task should be completed in a focused, scoped way.

Agents must:

- avoid changing unrelated files
- explain what changed
- explain how to test
- stop after completing the requested task

---

## Task Status Legend

- [ ] not started
- [~] in progress
- [x] completed
- [!] blocked

---

## Phase 1 — Project Foundation

## T1. Create initial database migration

Status: [x]

Create `database/migrations/001_initial_schema.sql`.

Include tables:

- profiles
- plans
- jobs
- job_targets
- transcript_segments
- translated_segments
- credit_ledger
- billing_events

Requirements:

- UUID primary keys
- `timestamptz` timestamps
- foreign keys
- indexes
- plan seed data:
  - Starter / 120 credits
  - Creator / 450 credits
  - Pro / 1200 credits

Use assumptions from project documentation.

---

## T2. Create database helper modules

Status: [x]

Create typed database helper modules under `lib/db/`.

Suggested files:

- `lib/db/client.ts`
- `lib/db/jobs.ts`
- `lib/db/targets.ts`
- `lib/db/credits.ts`
- `lib/db/plans.ts`
- `lib/db/users.ts`

Requirements:

- typed queries/helpers
- modular functions
- no UI code

---

## T3. Create shared TypeScript types

Status: [x]

Create shared types under `types/`.

Suggested files:

- `types/jobs.ts`
- `types/transcript.ts`
- `types/credits.ts`
- `types/billing.ts`

Types should reflect the schema and processing pipeline.

---

## Phase 2 — App Shell

## T4. Build marketing landing page

Status: [ ]

Build the landing page in `app/page.tsx` or `(marketing)` routes.

Include:

- hero section
- CTA
- feature summary
- pricing preview
- demo placeholder

Keep visuals professional and simple.

---

## T5. Build dashboard shell

Status: [x]

Build `/dashboard`.

Include:

- upload card
- credits summary card
- recent jobs table/card
- empty state

Use mock data if backend is not yet wired.

---

## T6. Build job detail page shell

Status: [x]

Build `/dashboard/jobs/[jobId]`.

Include:

- source media section
- job status section
- transcript panel placeholder
- output panel placeholder
- progress timeline

Use mock data if needed.

---

## T7. Build billing page shell

Status: [x]

Build `/dashboard/billing`.

Include:

- current plan card
- credits remaining
- next reset date
- upgrade/manage billing CTA

Note:
- Implemented with a live billing panel rather than a mock shell.

---

## Phase 3 — Upload and Job Creation

## T8. Create upload init route

Status: [x]

Create `POST /api/uploads/init`.

Responsibilities:

- validate upload metadata
- return upload instructions or path
- keep route lightweight

No heavy processing allowed.

---

## T9. Create job creation route

Status: [x]

Create `POST /api/jobs/create`.

Purpose:

Create a job only after a source media file has already been uploaded to storage.

Responsibilities:

- authenticate the user
- validate request payload from `unknown`
- verify the uploaded source object exists in storage
- verify the source object belongs to the authenticated user
- validate `outputMode`
- validate and deduplicate `targetLanguages`
- validate V1 duration and media constraints
- estimate credits
- reserve credits using ledger-based logic
- create `jobs`
- create `job_targets`
- return job summary payload

Request payload:

```json
{
  "storageBucket": "media",
  "storagePath": "uploads/{userId}/{uploadId}/source.mp4",
  "sourceFilename": "interview.mp4",
  "sourceMimeType": "video/mp4",
  "durationSeconds": 120,
  "outputMode": "subtitles",
  "targetLanguages": ["fr", "es"]
}
Must follow credit rules from project docs.

---

## T10. Wire dashboard upload flow

Status: [~]

Connect the dashboard upload UI to:

- upload init
- job creation

Use a simple flow:

1. choose file
2. choose languages
3. choose output mode
4. create job

No worker processing yet.

Note:
- The upload and job-creation flow is wired on `app/page.tsx`.
- `/dashboard` currently links to that flow instead of hosting it directly.

---

## Phase 4 — Credit System

## T11. Implement credit calculation module

Status: [x]

Create:

- `lib/credits/calculateCredits.ts`

Rules:

- credits = ceil(duration_minutes) × target_languages × multiplier

Multipliers:

- subtitles = 1
- dubbed_audio = 1.5
- lip_sync = 3

---

## T12. Implement credit reservation/finalization logic

Status: [x]

Create:

- `reserveCredits.ts`
- `finalizeCredits.ts`
- `releaseCredits.ts`

Requirements:

- ledger-based accounting
- append-only entries
- no direct balance mutation without ledger trace

---

## T13. Show real credit balances in UI

Status: [x]

Update dashboard and billing page to show live credit values from the database.

---

## Phase 5 — Media Preprocessing

## T14. Implement media normalization

Status: [x]

Create:

- `lib/ffmpeg/normalizeMedia.ts`

Requirements:

- normalize uploaded media
- standardize formats for downstream processing
- return metadata and output path

---

## T15. Implement audio extraction

Status: [x]

Create:

- `lib/ffmpeg/extractAudio.ts`

Requirements:

- produce mono WAV
- store output path
- easy integration into worker pipeline

---

## Phase 6 — Transcription

## T16. Implement transcription provider abstraction

Status: [x]

Create:

- `lib/ai/transcribe.ts`

Requirements:

- provider wrapper
- structured result
- no UI logic

---

## T17. Implement transcript persistence

Status: [x]

Create:

- `lib/jobs/steps/transcribeMedia.ts`

Responsibilities:

- call transcription provider
- persist transcript_segments
- update source language if detected
- update job state

---

## T18. Build transcript editor UI

Status: [x]

Update the job detail page to:

- display transcript segments
- support editing
- save `edited_source_text`

Use an API route if needed.

---

## Phase 7 — Translation and Subtitles

## T19. Implement translation provider abstraction

Status: [x]

Create:

- `lib/ai/translate.ts`

---

## T20. Implement transcript translation

Status: [x]

Create:

- `lib/jobs/steps/translateTranscript.ts`

Responsibilities:

- translate each transcript segment for each target language
- prefer `edited_source_text` when present
- persist translated_segments
- update target state

---

## T21. Implement subtitle generation

Status: [x]

Create:

- `lib/jobs/steps/generateSubtitles.ts`

Responsibilities:

- produce `.srt`
- upload/store subtitle file
- update `subtitle_path`
- update target state

---

## T22. Add subtitle downloads to job detail page

Status: [x]

Note:
- T25 and T29 were completed ahead of this task; subtitle downloads are now wired into the job detail UI.

Update UI to show downloadable subtitle files per target language.

---

## Phase 8 — Dubbed Audio

## T23. Implement TTS provider abstraction

Status: [x]

Create:

- `lib/ai/tts.ts`

---

## T24. Implement dubbed audio generation

Status: [x]

Create:

- `lib/jobs/steps/generateDubbedAudio.ts`

Responsibilities:

- generate target-language audio
- store dubbed file
- update `dubbed_audio_path`
- update target state

---

## T25. Add dubbed audio downloads to job detail page

Status: [x]

Update UI to show downloadable dubbed audio files.

---

## Phase 9 — Lip Sync

## T26. Implement lip-sync provider abstraction

Status: [x]

Create:

- `lib/ai/lipsync.ts`

---

## T27. Implement lip-sync request step

Status: [x]

Create:

- `lib/jobs/steps/requestLipSync.ts`

Responsibilities:

- send normalized video + dubbed audio to provider
- store provider job ID
- update target state

---

## T28. Implement lip-sync webhook route

Status: [x]

Create:

- `app/api/webhooks/lipsync/route.ts`

Responsibilities:

- validate callback
- update `dubbed_video_path`
- mark target completed/failed
- trigger final reconciliation if needed

---

## T29. Add lip-sync outputs to job detail page

Status: [x]

Update UI to show lip-sync video download/view options.

---

## Phase 10 — Worker Orchestration

## T30. Implement job states module

Status: [x]

Create:

- `lib/jobs/jobStates.ts`

Centralize valid state names and transitions.

---

## T31. Implement job enqueue function

Status: [x]

Create:

- `lib/jobs/enqueueJob.ts`

Responsibilities:

- queue job for background processing
- set status to queued

---

## T32. Implement worker job processor

Status: [x]

Create:

- `lib/jobs/processJob.ts`
- `worker/handlers/process-media-job.ts`

Responsibilities:

- run pipeline in order
- update job states
- handle target-level processing
- support partial success
- finalize/release credits correctly

---

## T33. Implement final output reconciliation

Status: [x]

Create logic that determines whether a job ends in:

- completed
- partial_success
- failed

Based on target states and available outputs.

---

## Phase 11 — Billing

## T34. Implement Stripe checkout session route

Status: [x]

Create:

- `app/api/stripe/create-checkout-session/route.ts`

Support:

- Starter
- Creator
- Pro
- 7-day trial with card on file

---

## T35. Implement Stripe webhook

Status: [x]

Create:

- `app/api/stripe/webhook/route.ts`

Responsibilities:

- store billing_events
- sync plan status
- refill monthly credits on renewal

---

## T36. Show real billing status in UI

Status: [x]

Update billing page and dashboard to reflect:

- current plan
- trial status
- renewal state
- credit reset timing

---

## Phase 12 — Polishing

## T37. Improve progress timeline UI

Status: [~]

Update job detail page to show:

- current step
- completed steps
- failure states
- partial success messaging

Note:
- A timeline component is implemented and shows current, completed, and terminal states.
- The job detail page still uses mock job data, so this is only partially complete.

---

## T38. Add better error messages

Status: [ ]

Improve user-facing errors for:

- upload validation
- job creation
- pipeline failures
- lip-sync failures

---

## T39. Add logging helpers

Status: [ ]

Create:

- `lib/utils/logger.ts`

Use for pipeline step logging and debugging.

---

## T40. Add basic admin/dev test scripts

Status: [ ]

Create scripts under `scripts/` for:

- sample job simulation
- FFmpeg test
- pipeline dry run

---

## Agent Execution Rule

When working from this file:

- pick only one task unless instructed otherwise
- keep changes scoped
- explain exactly what changed
- explain how to test
- do not silently expand task scope

---

## Priority Guidance

Highest priority tasks:

1. T1
2. T2
3. T8
4. T9
5. T11
6. T12
7. T14
8. T15
9. T16
10. T17

After these are complete, the rest can proceed smoothly.

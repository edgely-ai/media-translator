# Media Processing Pipeline

## Scope

This document describes the pipeline as implemented in the current repository,
not the idealized future system.

Confirmed facts:

- Upload initialization, job creation, processing-step modules, and webhook
  handlers exist.
- A worker runtime/poller exists and executes processing outside API routes.

## End-to-End Flow

### 1. Upload Initialization

- Client calls `/api/uploads/init`
- Server validates filename, mime type, file size, and optional duration
- Server returns a deterministic upload target in Supabase Storage

### 2. Source Upload

- Browser uploads the file directly to Supabase Storage bucket `media`
- Stored path format:
  `uploads/{userId}/{uploadId}/source.{ext}`

### 3. Job Creation

- Client calls `/api/jobs/create`
- Server validates:
  - authenticated ownership of the upload path
  - media constraints
  - output mode
  - target languages
  - credit estimate
- Supabase RPC creates:
  - `jobs` row in `created`
  - `job_targets`
  - `credit_ledger` reserve entry

### 4. Queueing

- The worker claims `created` jobs, transitions them to `queued`, and then
  executes processing.
- The worker can also recover previously queued jobs for execution.

### 5. Background Processing

Implemented orchestration entry points:

- `lib/jobs/processJob.ts`
- `worker/handlers/process-media-job.ts`

Pipeline order:

1. `normalizing`
   - `normalizeMedia()`
   - video -> normalized `source.mp4`
   - audio -> normalized `source.wav`
2. `extracting_audio`
   - `extractAudio()` unless normalized media is already audio
   - output `audio.wav`
3. `transcribing`
   - `transcribeMedia()`
   - validates returned segments
   - stores `transcript_segments`
   - stores detected source language
   - sets job to `transcript_ready`
4. `translating`
   - `translateTranscript()`
   - uses `edited_source_text` when present
   - stores `translated_segments`
   - updates target states
5. `generating_subtitles`
   - `generateSubtitles()`
   - generates local `.srt` files under `media/{jobId}/subtitles`
6. `generating_dubbed_audio` for non-subtitle jobs
   - `generateDubbedAudio()`
   - generates local dubbed audio under `media/{jobId}/dubbed`
7. `lip_sync_pending` for lip-sync jobs
   - `requestLipSync()`
   - sends normalized video path and dubbed audio path to the lip-sync provider
   - stores provider job IDs

### 5a. Cooperative Cancellation

- Jobs can receive a cancel request while `queued` or active.
- Cancellation requests are stored on the job:
  - `cancel_requested_at`
  - optional `cancel_reason`
- Cancellation is cooperative rather than force-kill.
- The worker honors cancellation only at safe boundaries:
  - before normalization
  - before audio extraction
  - before transcription
  - before translation
  - before subtitle generation
  - before dubbed-audio generation
  - before lip-sync request
  - before per-target loops where practical
- In-flight FFmpeg or provider calls are not interrupted mid-step.
- When cancellation is honored:
  - unfinished targets are marked with cancellation-derived failures
  - already successful outputs are preserved
  - reconciliation decides the truthful terminal state
- If no usable outputs exist, the job finishes as `canceled`.
- If usable outputs already exist, the truthful terminal state may still be
  `partial_success`.

### 6. Finalization

- `reconcileJobOutputs()` determines terminal status:
  - `completed`
  - `partial_success`
  - `failed`
  - `canceled`
- It also writes `finalize` and/or `release` entries into `credit_ledger`

### 7. Lip-Sync Completion

- External provider is expected to call `/api/webhooks/lipsync`
- Webhook updates the matching `job_target`
- Reconciliation runs again to finalize overall job status

## Async / Background Work

- Background work is executed by the committed worker runtime
- The worker remains a lightweight poller rather than a large queue stack
- Lip-sync completion is explicitly asynchronous and webhook-driven

## Outputs and Current Storage Behavior

Current implementation uses local worker files as temporary artifacts and
uploads durable outputs back to Supabase Storage:

- `media/{jobId}/source.mp4` or `source.wav`
- `media/{jobId}/audio.wav`
- `media/{jobId}/subtitles/{lang}.srt`
- `media/{jobId}/dubbed/{lang}.{format}`

Durable storage paths are written back onto `jobs` and `job_targets`.

## Retry / Failure Behavior

- Upload init and job creation fail synchronously with JSON error responses
- Processing step failures usually mark the job or target as failed
- Reconciliation may downgrade an apparent failure to `partial_success` if some
  usable outputs exist
- Manual retry is implemented as a new job attempt
  - the original job is not rewound
  - the new job links back via `retry_of_job_id`
  - retry reuses the original source media path and output mode
  - fully failed jobs retry all original targets
  - `partial_success` jobs retry only failed targets
  - retry reserves credits as a new attempt through the existing reservation
    path
- Automatic retry/backoff is still not implemented
- Provider-specific retry behavior is still not implemented

## Important Failure Points

- Supabase auth/token validation
- Missing source object in storage
- Insufficient credits
- FFmpeg availability or media incompatibility
- Provider not configured
- Invalid provider output shape
- Lip-sync webhook secret mismatch
- Stripe webhook signature mismatch

## Implementation Mismatches to Keep in Mind

- Cancellation is cooperative only; in-flight FFmpeg/provider work is not
  force-killed.
- Retry is manual new-attempt orchestration only; there is no automatic retry
  engine or backoff policy.
- UI-level cancel/retry actions remain more limited than the backend/API
  support.

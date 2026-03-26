# Media Processing Pipeline

## Scope

This document describes the pipeline as implemented in the current repository,
not the idealized future system.

Confirmed facts:

- Upload initialization, job creation, processing-step modules, and webhook
  handlers exist.
- A full queue-backed background execution system does not exist in this repo.

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

- Intended path: move job from `created` to `queued` using `enqueueJob()`
- Current reality: queue infrastructure is not implemented in this repo

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

### 6. Finalization

- `reconcileJobOutputs()` determines terminal status:
  - `completed`
  - `partial_success`
  - `failed`
- It also writes `finalize` and/or `release` entries into `credit_ledger`

### 7. Lip-Sync Completion

- External provider is expected to call `/api/webhooks/lipsync`
- Webhook updates the matching `job_target`
- Reconciliation runs again to finalize overall job status

## Async / Background Work

- Intended background work exists as library code only
- No queue transport, scheduler, or worker daemon is included in the repo
- Lip-sync completion is explicitly asynchronous and webhook-driven

## Outputs and Current Storage Behavior

Current implementation writes generated artifacts to the local filesystem:

- `media/{jobId}/source.mp4` or `source.wav`
- `media/{jobId}/audio.wav`
- `media/{jobId}/subtitles/{lang}.srt`
- `media/{jobId}/dubbed/{lang}.{format}`

The schema also stores output paths on `job_targets`, but there is no current
implementation that uploads generated outputs back to Supabase Storage.

## Retry / Failure Behavior

- Upload init and job creation fail synchronously with JSON error responses
- Processing step failures usually mark the job or target as failed
- Reconciliation may downgrade an apparent failure to `partial_success` if some
  usable outputs exist
- No queue-level retry/backoff mechanism is implemented
- No user-facing retry flow is implemented

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

- `jobs.source_media_path` is created from a Supabase Storage path, but FFmpeg
  steps expect a directly readable filesystem path.
- Translation step currently fails the whole job on the first target-level
  translation failure rather than allowing partial translation success.
- Generated artifacts are local files, not durable storage objects.

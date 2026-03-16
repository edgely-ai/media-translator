# Media Translator — System Architecture

## Overview

Media Translator is a SaaS application that converts spoken media into other languages.

Users upload a video or audio file and select:

- one output mode
- one or more target languages

The system processes the media through an AI pipeline and produces
outputs such as subtitles, dubbed audio, or lip-synced video.

---

## High-Level System Components

Frontend

- Next.js App Router
- Dashboard
- Upload interface
- Job status UI
- Transcript editor

Backend

- Next.js API routes
- Supabase PostgreSQL
- Supabase Storage

Media Processing

- FFmpeg
- Speech-to-Text
- Translation
- Text-to-Speech
- Lip-Sync provider

Worker

- background job processor
- orchestrates pipeline steps

Billing

- Stripe subscriptions
- credit accounting system

---

## Core Data Model

profiles  
User account information.

plans  
Subscription plans and monthly credit allocation.

jobs  
Represents one uploaded media processing request.

job_targets  
Represents one output language per job.

transcript_segments  
Stores source transcript segments with timestamps.

translated_segments  
Stores translated text for each transcript segment and target language.

credit_ledger  
Tracks all credit changes.

billing_events  
Tracks subscription events from Stripe.

---

## Job Lifecycle

A job progresses through several states.

created  
Job record exists but processing has not started.

queued  
Job is waiting for a worker.

normalizing  
Source media is converted into a standard format.

extracting_audio  
Audio track is extracted.

transcribing  
Speech-to-text runs.

transcript_ready  
Transcript segments are saved.

translating  
Transcript segments are translated.

generating_subtitles  
Subtitle files are produced.

generating_dubbed_audio  
Translated speech audio is synthesized.

lip_sync_pending  
Lip-sync provider is rendering video.

completed  
All outputs generated.

partial_success  
Some outputs succeeded while others failed.

failed  
The job could not be processed.

---

## Job Processing Pipeline

Step 1  
User uploads media.

Step 2  
Upload metadata is validated.

Step 3  
A job record is created.

Step 4  
Credits are reserved.

Step 5  
The worker processes the job.

Processing steps:

1. normalizeMedia  
Standardize codec and format.

2. extractAudio  
Produce WAV audio.

3. transcribeMedia  
Speech-to-text generates segments.

4. translateTranscript  
Segments translated per target language.

5. generateSubtitles  
Produce .srt files.

6. generateDubbedAudio  
Generate translated speech audio.

7. requestLipSync (optional)  
Send video and audio to lip-sync provider.

---

## Media Pipeline

Input media is normalized to avoid codec problems.

Example conversion:

source video → normalized MP4  
source audio → mono WAV

This prevents failures in later steps.

FFmpeg utilities handle these tasks.

---

## Transcript Model

Transcript is stored in segments.

Each segment contains:

- segment_index
- source_start_ms
- source_end_ms
- source_text
- edited_source_text

Users can edit transcripts before translation.

If edited text exists it replaces source_text during translation.

---

## Translation Model

Each transcript segment is translated per target language.

Relationship:

transcript_segments → translated_segments → job_targets

A unique translated segment exists for:

(job_target_id, transcript_segment_id)

---

## Credit System

Credits represent compute usage.

Credits are calculated as:

credits = duration_minutes × number_of_languages × multiplier

Multipliers

subtitles = 1  
dubbed_audio = 1.5  
lip_sync = 3

Credit flow

1. estimate credits
2. reserve credits
3. finalize credits on success
4. release credits on failure

All credit mutations are written to credit_ledger.

---

## Partial Success Strategy

Jobs may partially succeed.

Example:

subtitles generated  
dubbed audio generated  
lip sync failed

The job status becomes:

partial_success

Completed outputs remain available.

Unused reserved credits are released.

---

## Worker Architecture

Media processing does not run in HTTP requests.

Instead a background worker processes jobs.

Worker responsibilities

- poll queued jobs
- execute pipeline steps
- update job state
- store outputs
- finalize or release credits

Worker code lives in:

worker/
worker/handlers/

---

## Storage Layout

Files are stored in structured paths.

Example:

media/{job_id}/source.mp4  
media/{job_id}/audio.wav  
media/{job_id}/subtitles/en.srt  
media/{job_id}/dubbed/fr.wav  
media/{job_id}/lip_sync/fr.mp4

---

## Output Modes

Each job has one output mode.

subtitles  
Generate subtitle files.

dubbed_audio  
Generate translated speech audio.

lip_sync  
Generate lip-synced video.

---

## Lip Sync Constraints

Lip sync works best when:

- speaker's face is visible
- minimal scene cuts
- short video duration

V1 restrictions

- talking-head videos only
- max duration 5 minutes

If lip sync fails the job remains usable.

---

## Observability

Each pipeline step logs:

- job_id
- step name
- elapsed time
- provider response id
- error message

Logs allow debugging and retry.

---

## Development Philosophy

Build defensively.

Assume user uploads will be messy.

Normalize media early.

Allow partial success.

Keep modules small and composable.

Avoid tightly coupled code.

Workers should handle heavy processing.

API routes should remain thin.

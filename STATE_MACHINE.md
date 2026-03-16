# Media Translator — Job State Machine

This document defines the allowed job states and transitions for the
Media Translator processing system.

All job orchestration must follow this state machine.

Agents must not introduce new states or transitions unless explicitly instructed.

Related documents:

- ARCHITECTURE.md
- PIPELINE.md
- CONSTRAINTS.md

---

## Overview

A **job** represents one uploaded media processing request.

A job moves through multiple states as the media pipeline executes.

Each pipeline step updates the job state.

---

## Job State List

Allowed job states:

created  
queued  
normalizing  
extracting_audio  
transcribing  
transcript_ready  
translating  
generating_subtitles  
generating_dubbed_audio  
lip_sync_pending  
completed  
partial_success  
failed

---

## State Transition Diagram

created  
→ queued  

queued  
→ normalizing  

normalizing  
→ extracting_audio  
→ failed  

extracting_audio  
→ transcribing  
→ failed  

transcribing  
→ transcript_ready  
→ failed  

transcript_ready  
→ translating  

translating  
→ generating_subtitles  
→ partial_success  

generating_subtitles  
→ generating_dubbed_audio  
→ completed (if subtitles-only job)  

generating_dubbed_audio  
→ lip_sync_pending  
→ completed (if dubbed_audio job)  

lip_sync_pending  
→ completed  
→ partial_success  

---

## State Descriptions

created

The job record exists but processing has not begun.

Actions:

- credits estimated
- credits reserved
- job_targets created

Next state:
queued

---

queued

The job is waiting for a worker.

Actions:

- worker picks up job

Next state:
normalizing

---

normalizing

The uploaded media is converted to a normalized format.

Example conversions:

video → normalized MP4  
audio → mono WAV  

Next states:
extracting_audio  
failed

---

extracting_audio

Audio track is extracted from the normalized media.

Output:
clean WAV audio file

Next states:
transcribing  
failed

---

transcribing

Speech-to-text generates transcript segments.

Outputs stored in:

transcript_segments

Next states:
transcript_ready  
failed

---

transcript_ready

Transcript exists and may optionally be edited.

Translation stage begins after this.

Next state:
translating

---

translating

Transcript segments are translated into target languages.

Outputs stored in:

translated_segments

Next states:
generating_subtitles  
partial_success

---

generating_subtitles

Subtitle files are generated for each target language.

Output format:

.srt

Next states:
generating_dubbed_audio  
completed (if output mode = subtitles)

---

generating_dubbed_audio

Translated speech audio is generated via TTS.

Output:

dubbed audio files

Next states:
lip_sync_pending  
completed (if output mode = dubbed_audio)

---

lip_sync_pending

Lip-sync rendering is requested from an external provider.

This stage may be asynchronous.

Completion may occur via webhook.

Next states:
completed  
partial_success

---

completed

All required outputs were successfully generated.

Credits:
finalize reserved credits

---

partial_success

Some targets succeeded while others failed.

Usable outputs remain available.

Credits:
finalize credits for successful targets  
release unused reserved credits

---

failed

The job could not produce any usable output.

Credits:
release reserved credits

---

## Target State Machine

Each job may contain multiple job_targets.

Target states:

pending  
translating  
subtitles_ready  
audio_ready  
lipsync_requested  
completed  
failed

Targets progress independently.

This allows partial success.

---

## Partial Success Example

Job request:

target languages:

- French
- Spanish

output mode:
lip_sync

Possible result:

French:

- subtitles_ready
- audio_ready
- completed

Spanish:

- subtitles_ready
- audio_ready
- failed (lip-sync failure)

Job status becomes:

partial_success

Outputs remain available.

---

## Retry Rules

Safe retry stages:

translating  
generating_subtitles  
generating_dubbed_audio  
lip_sync_pending

Unsafe retries:

credit finalization  
job creation

Retries must not duplicate ledger entries.

---

## State Safety Rules

Agents must never:

skip required states

Example (invalid):

transcribing → generating_subtitles

Required:

transcribing → transcript_ready → translating

Agents must not revert a job to earlier states.

Example (invalid):

translating → transcribing

---

## Observability

Each state transition must log:

job_id  
previous_state  
new_state  
timestamp

Logs must allow reconstruction of the full job lifecycle.

---

## Summary

The state machine ensures:

- predictable pipeline behavior
- safe retries
- partial success support
- reliable credit accounting

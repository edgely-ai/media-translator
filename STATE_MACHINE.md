# Job State Machine

## Job States

Defined in `types/jobs.ts` and `lib/jobs/jobStates.ts`:

Confirmed facts:

- `created`
- `queued`
- `normalizing`
- `extracting_audio`
- `transcribing`
- `transcript_ready`
- `translating`
- `generating_subtitles`
- `generating_dubbed_audio`
- `lip_sync_pending`
- `completed`
- `partial_success`
- `failed`
- `canceled`

## Target States

Confirmed facts:

- `pending`
- `translating`
- `subtitles_ready`
- `audio_ready`
- `lipsync_requested`
- `completed`
- `failed`

## Allowed Job Transitions

- `created -> queued`
- `created -> queued | canceled`
- `queued -> normalizing | canceled`
- `normalizing -> extracting_audio | failed | canceled`
- `extracting_audio -> transcribing | failed | canceled`
- `transcribing -> transcript_ready | failed | canceled`
- `transcript_ready -> translating | canceled`
- `translating -> generating_subtitles | partial_success | failed | canceled`
- `generating_subtitles -> generating_dubbed_audio | completed | partial_success | failed | canceled`
- `generating_dubbed_audio -> lip_sync_pending | completed | partial_success | failed | canceled`
- `lip_sync_pending -> completed | partial_success | failed | canceled`

Terminal states:

- `completed`
- `partial_success`
- `failed`
- `canceled`

## Allowed Target Transitions

- `pending -> translating | failed`
- `translating -> subtitles_ready | failed`
- `subtitles_ready -> audio_ready | completed | failed`
- `audio_ready -> lipsync_requested | completed | failed`
- `lipsync_requested -> completed | failed`

## Actual Runtime Behavior

### Creation Path

- Job is created in `created`
- The worker moves eligible jobs to `queued`
- The worker then claims and processes them

### Processing Path by Output Mode

#### `subtitles`

`queued`
-> `normalizing`
-> `extracting_audio`
-> `transcribing`
-> `transcript_ready`
-> `translating`
-> `generating_subtitles`
-> `completed` or `partial_success` or `failed` or `canceled`

#### `dubbed_audio`

`queued`
-> `normalizing`
-> `extracting_audio`
-> `transcribing`
-> `transcript_ready`
-> `translating`
-> `generating_subtitles`
-> `generating_dubbed_audio`
-> `completed` or `partial_success` or `failed` or `canceled`

#### `lip_sync`

`queued`
-> `normalizing`
-> `extracting_audio`
-> `transcribing`
-> `transcript_ready`
-> `translating`
-> `generating_subtitles`
-> `generating_dubbed_audio`
-> `lip_sync_pending`
-> webhook-driven `completed` or `partial_success` or `failed` or `canceled`

## Failure / Retry / Cancel States

- Failure state implemented: `failed`
- Partial terminal state implemented: `partial_success`
- Cancel terminal state implemented: `canceled`
- Manual retry via new-attempt job creation is implemented
- Automatic retry behavior/backoff is not implemented
- Existing jobs are not retried by moving them backward through earlier states

## Cancellation Semantics

- Cancellation is cooperative and worker-owned
- API routes only record the cancel request on the job
- The worker honors cancellation at safe boundaries, not mid-step
- Cancellation does not destroy successful outputs
- If usable outputs already exist when cancellation is honored, the final state
  may still be `partial_success`
- `canceled` is used when cancellation is honored and no usable outputs exist

## Retry Semantics

- Retry is modeled as a new job attempt, not a backward transition
- The original job remains immutable in its current terminal state
- The new retry attempt links to the original via `retry_of_job_id`
- Failed jobs retry all original targets
- `partial_success` jobs retry only failed targets
- Retry reserves credits as a new attempt and does not reopen prior ledger
  history

## Important Mismatches Between Intended and Actual Behavior

- `requestLipSync()` can set the job to `partial_success` when no requests are
  sent successfully, but `processJob()` then catches and may briefly overwrite
  to `failed` before reconciliation recalculates the terminal state.
- `generateSubtitles()` and `generateDubbedAudio()` can mark a job terminal
  before `reconcileJobOutputs()` runs; reconciliation is the real source of
  truth for terminal credit handling.
- Force-kill interruption of in-flight FFmpeg/provider calls is still not
  implemented; cancellation waits for the next checkpoint.
- UI-level cancel/retry actions remain more limited than the backend/API
  support.

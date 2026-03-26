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
- `queued -> normalizing`
- `normalizing -> extracting_audio | failed`
- `extracting_audio -> transcribing | failed`
- `transcribing -> transcript_ready | failed`
- `transcript_ready -> translating`
- `translating -> generating_subtitles | partial_success | failed`
- `generating_subtitles -> generating_dubbed_audio | completed | partial_success | failed`
- `generating_dubbed_audio -> lip_sync_pending | completed | partial_success | failed`
- `lip_sync_pending -> completed | partial_success | failed`

Terminal states:

- `completed`
- `partial_success`
- `failed`

## Allowed Target Transitions

- `pending -> translating | failed`
- `translating -> subtitles_ready | failed`
- `subtitles_ready -> audio_ready | completed | failed`
- `audio_ready -> lipsync_requested | completed | failed`
- `lipsync_requested -> completed | failed`

## Actual Runtime Behavior

### Creation Path

- Job is created in `created`
- `enqueueJob()` can move it to `queued`
- No queue runner currently invokes that automatically

### Processing Path by Output Mode

#### `subtitles`

`queued`
-> `normalizing`
-> `extracting_audio`
-> `transcribing`
-> `transcript_ready`
-> `translating`
-> `generating_subtitles`
-> `completed` or `partial_success` or `failed`

#### `dubbed_audio`

`queued`
-> `normalizing`
-> `extracting_audio`
-> `transcribing`
-> `transcript_ready`
-> `translating`
-> `generating_subtitles`
-> `generating_dubbed_audio`
-> `completed` or `partial_success` or `failed`

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
-> webhook-driven `completed` or `partial_success` or `failed`

## Failure / Retry / Cancel States

- Failure state implemented: `failed`
- Partial terminal state implemented: `partial_success`
- Cancel state: not implemented
- Retry state: not implemented
- Automatic retry behavior: not implemented

## Important Mismatches Between Intended and Actual Behavior

- The transition map allows `translating -> partial_success`, but
  `translateTranscript()` currently throws on the first target failure and marks
  the job `failed`.
- `requestLipSync()` can set the job to `partial_success` when no requests are
  sent successfully, but `processJob()` then catches and may briefly overwrite
  to `failed` before reconciliation recalculates the terminal state.
- `generateSubtitles()` and `generateDubbedAudio()` can mark a job terminal
  before `reconcileJobOutputs()` runs; reconciliation is the real source of
  truth for terminal credit handling.
- Job detail UI renders a timeline from the state machine, but the surrounding
  page still uses mock job metadata.

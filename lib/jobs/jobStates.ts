import type { JobStatus, JobTargetStatus } from "@/types/jobs";

export const JOB_STATE = {
  CREATED: "created",
  QUEUED: "queued",
  NORMALIZING: "normalizing",
  EXTRACTING_AUDIO: "extracting_audio",
  TRANSCRIBING: "transcribing",
  TRANSCRIPT_READY: "transcript_ready",
  TRANSLATING: "translating",
  GENERATING_SUBTITLES: "generating_subtitles",
  GENERATING_DUBBED_AUDIO: "generating_dubbed_audio",
  LIP_SYNC_PENDING: "lip_sync_pending",
  COMPLETED: "completed",
  PARTIAL_SUCCESS: "partial_success",
  FAILED: "failed",
} as const satisfies Record<string, JobStatus>;

export const TARGET_STATE = {
  PENDING: "pending",
  TRANSLATING: "translating",
  SUBTITLES_READY: "subtitles_ready",
  AUDIO_READY: "audio_ready",
  LIPSYNC_REQUESTED: "lipsync_requested",
  COMPLETED: "completed",
  FAILED: "failed",
} as const satisfies Record<string, JobTargetStatus>;

export const JOB_STATE_TRANSITIONS: Readonly<Record<JobStatus, readonly JobStatus[]>> = {
  [JOB_STATE.CREATED]: [JOB_STATE.QUEUED],
  [JOB_STATE.QUEUED]: [JOB_STATE.NORMALIZING],
  [JOB_STATE.NORMALIZING]: [JOB_STATE.EXTRACTING_AUDIO, JOB_STATE.FAILED],
  [JOB_STATE.EXTRACTING_AUDIO]: [JOB_STATE.TRANSCRIBING, JOB_STATE.FAILED],
  [JOB_STATE.TRANSCRIBING]: [JOB_STATE.TRANSCRIPT_READY, JOB_STATE.FAILED],
  [JOB_STATE.TRANSCRIPT_READY]: [JOB_STATE.TRANSLATING],
  [JOB_STATE.TRANSLATING]: [
    JOB_STATE.GENERATING_SUBTITLES,
    JOB_STATE.PARTIAL_SUCCESS,
    JOB_STATE.FAILED,
  ],
  [JOB_STATE.GENERATING_SUBTITLES]: [
    JOB_STATE.GENERATING_DUBBED_AUDIO,
    JOB_STATE.COMPLETED,
    JOB_STATE.PARTIAL_SUCCESS,
    JOB_STATE.FAILED,
  ],
  [JOB_STATE.GENERATING_DUBBED_AUDIO]: [
    JOB_STATE.LIP_SYNC_PENDING,
    JOB_STATE.COMPLETED,
    JOB_STATE.PARTIAL_SUCCESS,
    JOB_STATE.FAILED,
  ],
  [JOB_STATE.LIP_SYNC_PENDING]: [
    JOB_STATE.COMPLETED,
    JOB_STATE.PARTIAL_SUCCESS,
    JOB_STATE.FAILED,
  ],
  [JOB_STATE.COMPLETED]: [],
  [JOB_STATE.PARTIAL_SUCCESS]: [],
  [JOB_STATE.FAILED]: [],
};

export const TARGET_STATE_TRANSITIONS: Readonly<
  Record<JobTargetStatus, readonly JobTargetStatus[]>
> = {
  [TARGET_STATE.PENDING]: [TARGET_STATE.TRANSLATING, TARGET_STATE.FAILED],
  [TARGET_STATE.TRANSLATING]: [TARGET_STATE.SUBTITLES_READY, TARGET_STATE.FAILED],
  [TARGET_STATE.SUBTITLES_READY]: [
    TARGET_STATE.AUDIO_READY,
    TARGET_STATE.COMPLETED,
    TARGET_STATE.FAILED,
  ],
  [TARGET_STATE.AUDIO_READY]: [
    TARGET_STATE.LIPSYNC_REQUESTED,
    TARGET_STATE.COMPLETED,
    TARGET_STATE.FAILED,
  ],
  [TARGET_STATE.LIPSYNC_REQUESTED]: [TARGET_STATE.COMPLETED, TARGET_STATE.FAILED],
  [TARGET_STATE.COMPLETED]: [],
  [TARGET_STATE.FAILED]: [],
};

export function canTransitionJobState(
  current: JobStatus,
  next: JobStatus,
): boolean {
  return JOB_STATE_TRANSITIONS[current].includes(next);
}

export function canTransitionTargetState(
  current: JobTargetStatus,
  next: JobTargetStatus,
): boolean {
  return TARGET_STATE_TRANSITIONS[current].includes(next);
}

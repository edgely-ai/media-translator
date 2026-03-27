import { JOB_STATE } from "@/lib/jobs/jobStates";
import type { JobStatus, JobTargetRow } from "@/types/jobs";

export function isRetryableStatus(status: JobStatus): boolean {
  return status === JOB_STATE.FAILED || status === JOB_STATE.PARTIAL_SUCCESS;
}

export function getRetryTargetLanguages(
  status: JobStatus,
  targets: Pick<JobTargetRow, "status" | "target_language">[],
): string[] {
  if (status === JOB_STATE.FAILED) {
    return targets.map((target) => target.target_language);
  }

  return targets
    .filter((target) => target.status === "failed")
    .map((target) => target.target_language);
}

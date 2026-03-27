import test from "node:test";
import assert from "node:assert/strict";

import { computeReconciliation } from "@/lib/jobs/reconciliationRules";
import { getRetryTargetLanguages, isRetryableStatus } from "@/lib/jobs/retryPlanning";

function makeJob(overrides: Partial<Parameters<typeof computeReconciliation>[0]> = {}) {
  return {
    id: "job-1",
    output_mode: "dubbed_audio" as const,
    status: "generating_dubbed_audio" as const,
    error_message: null,
    cancel_reason: null,
    canceled_at: null,
    ...overrides,
  };
}

function makeTarget(
  id: string,
  overrides: Partial<Parameters<typeof computeReconciliation>[1][number]> = {},
) {
  return {
    id,
    status: "pending" as const,
    subtitle_path: null,
    dubbed_audio_path: null,
    dubbed_video_path: null,
    error_message: null,
    ...overrides,
  };
}

test("completed outcome finalizes all reserved credits when all targets succeed", () => {
  const result = computeReconciliation(
    makeJob({ output_mode: "subtitles", status: "generating_subtitles" }),
    [
      makeTarget("t1", { status: "completed", subtitle_path: "media/job-1/subtitles/fr.srt" }),
      makeTarget("t2", { status: "completed", subtitle_path: "media/job-1/subtitles/es.srt" }),
    ],
    [{ entry_type: "reserve", amount: -12 }],
  );

  assert.equal(result.status, "completed");
  assert.equal(result.finalizedCredits, 12);
  assert.equal(result.releasedCredits, 0);
  assert.deepEqual(result.successfulTargetIds, ["t1", "t2"]);
});

test("partial_success preserves successful outputs and splits finalize/release credits", () => {
  const result = computeReconciliation(
    makeJob({ output_mode: "dubbed_audio", status: "generating_dubbed_audio" }),
    [
      makeTarget("t1", { status: "completed", dubbed_audio_path: "media/job-1/dubbed/fr.wav" }),
      makeTarget("t2", { status: "failed", error_message: "provider failed" }),
    ],
    [{ entry_type: "reserve", amount: -10 }],
  );

  assert.equal(result.status, "partial_success");
  assert.equal(result.finalizedCredits, 5);
  assert.equal(result.releasedCredits, 5);
  assert.deepEqual(result.successfulTargetIds, ["t1"]);
  assert.deepEqual(result.failedTargetIds, ["t2"]);
  assert.match(result.terminalErrorMessage ?? "", /provider failed/);
});

test("failed outcome releases all reserved credits when no usable outputs exist", () => {
  const result = computeReconciliation(
    makeJob({ output_mode: "subtitles", status: "generating_subtitles" }),
    [
      makeTarget("t1", { status: "failed", error_message: "bad transcript" }),
      makeTarget("t2", { status: "failed", error_message: "bad provider output" }),
    ],
    [{ entry_type: "reserve", amount: -8 }],
  );

  assert.equal(result.status, "failed");
  assert.equal(result.finalizedCredits, 0);
  assert.equal(result.releasedCredits, 8);
});

test("canceled outcome wins only when no usable outputs exist", () => {
  const canceled = computeReconciliation(
    makeJob({
      status: "translating",
      canceled_at: "2026-03-27T00:00:00.000Z",
      cancel_reason: "user requested",
    }),
    [
      makeTarget("t1", { status: "failed", error_message: "Processing canceled by user request." }),
    ],
    [{ entry_type: "reserve", amount: -6 }],
  );

  assert.equal(canceled.status, "canceled");
  assert.equal(canceled.releasedCredits, 6);
  assert.match(canceled.terminalErrorMessage ?? "", /user requested/);

  const partialAfterCancel = computeReconciliation(
    makeJob({
      output_mode: "dubbed_audio",
      status: "generating_dubbed_audio",
      canceled_at: "2026-03-27T00:00:00.000Z",
    }),
    [
      makeTarget("t1", { status: "completed", dubbed_audio_path: "media/job-1/dubbed/fr.wav" }),
      makeTarget("t2", { status: "failed", error_message: "Processing canceled by user request." }),
    ],
    [{ entry_type: "reserve", amount: -6 }],
  );

  assert.equal(partialAfterCancel.status, "partial_success");
  assert.equal(partialAfterCancel.finalizedCredits, 3);
  assert.equal(partialAfterCancel.releasedCredits, 3);
});

test("retry planning treats retry as a new attempt and scopes targets correctly", () => {
  assert.equal(isRetryableStatus("failed"), true);
  assert.equal(isRetryableStatus("partial_success"), true);
  assert.equal(isRetryableStatus("completed"), false);

  const failedTargets = [
    { status: "failed" as const, target_language: "fr" },
    { status: "failed" as const, target_language: "es" },
  ];
  assert.deepEqual(getRetryTargetLanguages("failed", failedTargets), ["fr", "es"]);

  const partialTargets = [
    { status: "completed" as const, target_language: "fr" },
    { status: "failed" as const, target_language: "es" },
    { status: "failed" as const, target_language: "de" },
  ];
  assert.deepEqual(getRetryTargetLanguages("partial_success", partialTargets), [
    "es",
    "de",
  ]);
});

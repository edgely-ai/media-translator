import { runWorkerRuntime } from "@/worker/runtime";

function parsePositiveIntegerArg(
  value: string | undefined,
  fallback: number,
  name: string,
): number {
  if (!value) {
    return fallback;
  }

  const parsed = Number.parseInt(value, 10);

  if (!Number.isInteger(parsed) || parsed <= 0) {
    throw new Error(`${name} must be a positive integer.`);
  }

  return parsed;
}

function parseBooleanEnv(name: string): boolean {
  const value = process.env[name]?.trim().toLowerCase();

  return value === "1" || value === "true" || value === "yes";
}

async function main(): Promise<void> {
  const args = new Set(process.argv.slice(2));

  await runWorkerRuntime({
    pollIntervalMs: parsePositiveIntegerArg(
      process.env.WORKER_POLL_INTERVAL_MS,
      5_000,
      "WORKER_POLL_INTERVAL_MS",
    ),
    queuedScanLimit: parsePositiveIntegerArg(
      process.env.WORKER_QUEUED_SCAN_LIMIT,
      10,
      "WORKER_QUEUED_SCAN_LIMIT",
    ),
    outputRootDir: process.env.WORKER_OUTPUT_ROOT_DIR?.trim() || "media",
    lipSyncCallbackUrl: process.env.WORKER_LIPSYNC_CALLBACK_URL?.trim() || null,
    runOnce: args.has("--once") || parseBooleanEnv("WORKER_RUN_ONCE"),
    heartbeatIntervalMs: parsePositiveIntegerArg(
      process.env.WORKER_HEARTBEAT_INTERVAL_MS,
      60_000,
      "WORKER_HEARTBEAT_INTERVAL_MS",
    ),
    stuckJobThresholdMs: parsePositiveIntegerArg(
      process.env.WORKER_STUCK_JOB_THRESHOLD_MS,
      900_000,
      "WORKER_STUCK_JOB_THRESHOLD_MS",
    ),
    stuckJobSampleLimit: parsePositiveIntegerArg(
      process.env.WORKER_STUCK_JOB_SAMPLE_LIMIT,
      5,
      "WORKER_STUCK_JOB_SAMPLE_LIMIT",
    ),
  });
}

void main().catch((error) => {
  const errorMessage =
    error instanceof Error ? error.stack ?? error.message : String(error);

  console.error(
    JSON.stringify({
      ts: new Date().toISOString(),
      scope: "worker",
      level: "error",
      event: "worker_runtime_crashed",
      error_message: errorMessage,
    }),
  );

  process.exitCode = 1;
});

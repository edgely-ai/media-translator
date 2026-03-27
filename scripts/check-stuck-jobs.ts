import { closePostgresPool, getPostgresQueryExecutor } from "@/lib/db/postgres";
import { listPotentiallyStuckJobs } from "@/lib/ops/stuckJobs";

function parsePositiveInteger(value: string | undefined, fallback: number): number {
  if (!value) {
    return fallback;
  }

  const parsed = Number.parseInt(value, 10);

  if (!Number.isInteger(parsed) || parsed <= 0) {
    throw new Error("Expected a positive integer.");
  }

  return parsed;
}

async function main(): Promise<void> {
  const thresholdMinutes = parsePositiveInteger(
    process.env.STUCK_JOB_THRESHOLD_MINUTES,
    15,
  );
  const limit = parsePositiveInteger(process.env.STUCK_JOB_LIMIT, 25);
  const db = getPostgresQueryExecutor();
  const jobs = await listPotentiallyStuckJobs(db, {
    olderThanMs: thresholdMinutes * 60 * 1000,
    limit,
  });

  console.info(
    JSON.stringify({
      ts: new Date().toISOString(),
      scope: "ops",
      event: "stuck_jobs_report",
      threshold_minutes: thresholdMinutes,
      count: jobs.length,
      jobs,
    }),
  );
}

void main()
  .catch((error) => {
    console.error(
      JSON.stringify({
        ts: new Date().toISOString(),
        scope: "ops",
        level: "error",
        event: "stuck_jobs_report_failed",
        error_message: error instanceof Error ? error.message : String(error),
      }),
    );
    process.exitCode = 1;
  })
  .finally(async () => {
    await closePostgresPool();
  });

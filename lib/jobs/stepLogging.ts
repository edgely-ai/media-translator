type LogLevel = "info" | "warn" | "error";

interface StepLogBaseContext {
  jobId: string;
  step: string;
}

type StepLogContext = StepLogBaseContext & Record<string, unknown>;

function getConsoleMethod(level: LogLevel) {
  if (level === "error") {
    return console.error;
  }

  if (level === "warn") {
    return console.warn;
  }

  return console.info;
}

function toErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : "Unknown pipeline error.";
}

function logStepEvent(
  level: LogLevel,
  message: string,
  context: StepLogContext,
): void {
  const { jobId, step, ...rest } = context;

  getConsoleMethod(level)(message, {
    job_id: jobId,
    step,
    ...rest,
  });
}

export function logJobStepStarted(
  context: StepLogContext,
): void {
  logStepEvent("info", "[jobs] step started", context);
}

export function logJobStepCompleted(
  context: StepLogContext & { startedAt: number },
): void {
  const { startedAt, ...rest } = context;

  logStepEvent("info", "[jobs] step completed", {
    ...rest,
    duration_ms: Date.now() - startedAt,
  });
}

export function logJobStepFailed(
  context: StepLogContext & { startedAt: number; error: unknown },
): void {
  const { startedAt, error, ...rest } = context;

  logStepEvent("error", "[jobs] step failed", {
    ...rest,
    duration_ms: Date.now() - startedAt,
    error_message: toErrorMessage(error),
  });
}

export function logJobTargetEvent(
  level: LogLevel,
  message: string,
  context: StepLogContext,
): void {
  logStepEvent(level, message, context);
}

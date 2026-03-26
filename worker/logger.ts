export type WorkerLogLevel = "info" | "warn" | "error";

export type WorkerLogContext = Record<string, unknown>;

export function logWorkerEvent(
  level: WorkerLogLevel,
  event: string,
  context: WorkerLogContext = {},
): void {
  const entry = {
    ts: new Date().toISOString(),
    scope: "worker",
    level,
    event,
    ...context,
  };
  const line = JSON.stringify(entry);

  if (level === "error") {
    console.error(line);
    return;
  }

  if (level === "warn") {
    console.warn(line);
    return;
  }

  console.info(line);
}

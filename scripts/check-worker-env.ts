import { getWorkerRuntimeChecks } from "@/lib/ops/workerRuntimeChecks";

console.info(
  JSON.stringify({
    ts: new Date().toISOString(),
    scope: "ops",
    event: "worker_runtime_checks",
    checks: getWorkerRuntimeChecks(),
  }),
);

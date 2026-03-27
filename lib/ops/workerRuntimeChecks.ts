import { spawnSync } from "node:child_process";

function hasEnv(name: string): boolean {
  return Boolean(process.env[name]?.trim());
}

function checkFfmpegOnPath(): boolean {
  const result = spawnSync("ffmpeg", ["-version"], {
    stdio: "ignore",
    shell: false,
  });

  return result.status === 0;
}

export interface WorkerRuntimeChecks {
  ffmpeg_on_path: boolean;
  database_url_configured: boolean;
  supabase_url_configured: boolean;
  supabase_service_role_configured: boolean;
  openai_api_key_configured: boolean;
  lipsync_webhook_secret_configured: boolean;
}

export function getWorkerRuntimeChecks(): WorkerRuntimeChecks {
  return {
    ffmpeg_on_path: checkFfmpegOnPath(),
    database_url_configured: hasEnv("DATABASE_URL"),
    supabase_url_configured: hasEnv("NEXT_PUBLIC_SUPABASE_URL"),
    supabase_service_role_configured: hasEnv("SUPABASE_SERVICE_ROLE_KEY"),
    openai_api_key_configured: hasEnv("OPENAI_API_KEY"),
    lipsync_webhook_secret_configured: hasEnv("LIPSYNC_WEBHOOK_SECRET"),
  };
}

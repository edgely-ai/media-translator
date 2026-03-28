import { spawnSync } from "node:child_process";

function hasEnv(name: string): boolean {
  return Boolean(process.env[name]?.trim());
}

function readEnv(name: string): string | null {
  const value = process.env[name]?.trim();

  return value ? value : null;
}

function checkFfmpegOnPath(): boolean {
  const result = spawnSync("ffmpeg", ["-version"], {
    stdio: "ignore",
    shell: false,
  });

  return result.status === 0;
}

interface ParsedUrlCheck {
  configured: boolean;
  valid: boolean;
  host: string | null;
}

function parseUrlCheck(name: string): ParsedUrlCheck {
  const value = readEnv(name);

  if (!value) {
    return {
      configured: false,
      valid: false,
      host: null,
    };
  }

  try {
    const url = new URL(value);

    return {
      configured: true,
      valid: Boolean(url.hostname),
      host: url.hostname || null,
    };
  } catch {
    return {
      configured: true,
      valid: false,
      host: null,
    };
  }
}

export interface WorkerRuntimeChecks {
  ffmpeg_on_path: boolean;
  database_url_configured: boolean;
  database_url_valid: boolean;
  database_host: string | null;
  supabase_url_configured: boolean;
  supabase_url_valid: boolean;
  supabase_host: string | null;
  supabase_service_role_configured: boolean;
  openai_api_key_configured: boolean;
  lipsync_webhook_secret_configured: boolean;
  configuration_issues: string[];
}

export function getWorkerRuntimeChecks(): WorkerRuntimeChecks {
  const databaseUrl = parseUrlCheck("DATABASE_URL");
  const supabaseUrl = parseUrlCheck("NEXT_PUBLIC_SUPABASE_URL");
  const configurationIssues: string[] = [];

  if (databaseUrl.configured && !databaseUrl.valid) {
    configurationIssues.push(
      "DATABASE_URL is present but is not a valid URL.",
    );
  }

  if (supabaseUrl.configured && !supabaseUrl.valid) {
    configurationIssues.push(
      "NEXT_PUBLIC_SUPABASE_URL is present but is not a valid URL.",
    );
  }

  if (
    databaseUrl.valid &&
    databaseUrl.host &&
    databaseUrl.host.endsWith(".supabase.co") &&
    !databaseUrl.host.startsWith("db.")
  ) {
    configurationIssues.push(
      "DATABASE_URL points at a Supabase host without the required db. subdomain.",
    );
  }

  return {
    ffmpeg_on_path: checkFfmpegOnPath(),
    database_url_configured: databaseUrl.configured,
    database_url_valid: databaseUrl.valid,
    database_host: databaseUrl.host,
    supabase_url_configured: supabaseUrl.configured,
    supabase_url_valid: supabaseUrl.valid,
    supabase_host: supabaseUrl.host,
    supabase_service_role_configured: hasEnv("SUPABASE_SERVICE_ROLE_KEY"),
    openai_api_key_configured: hasEnv("OPENAI_API_KEY"),
    lipsync_webhook_secret_configured: hasEnv("LIPSYNC_WEBHOOK_SECRET"),
    configuration_issues: configurationIssues,
  };
}

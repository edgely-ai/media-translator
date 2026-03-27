import { NextResponse } from "next/server";

function hasEnv(name: string): boolean {
  return Boolean(process.env[name]?.trim());
}

export async function GET() {
  return NextResponse.json(
    {
      service: "media-translator-web",
      status: "ok",
      timestamp: new Date().toISOString(),
      environment: process.env.NODE_ENV ?? "unknown",
      commit: process.env.GIT_COMMIT_SHA ?? null,
      readiness: {
        database_url_configured: hasEnv("DATABASE_URL"),
        supabase_url_configured: hasEnv("NEXT_PUBLIC_SUPABASE_URL"),
        supabase_service_role_configured: hasEnv("SUPABASE_SERVICE_ROLE_KEY"),
      },
    },
    { status: 200 },
  );
}

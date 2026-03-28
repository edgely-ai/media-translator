# Media Translator

Media Translator is a SaaS application for translating video and audio
content into other languages.

Current repo state:

- web app plus worker are both committed and runnable
- output modes: `subtitles`, `dubbed_audio`, `lip_sync`
- source uploads, worker processing, durable artifact persistence, and billing
  are all wired in the current codebase
- real OpenAI-backed STT / translation / TTS paths exist, with env-selectable
  mock fallbacks

## Documentation

Read these files before making changes:

- `AGENTS.md`
- `ARCHITECTURE.md`
- `PIPELINE.md`
- `CONSTRAINTS.md`

## Getting Started

Install dependencies:

```bash
npm install
```

Start the web app and worker in separate terminals:

```bash
npm run dev:web
npm run dev:worker
```

You can also use the committed `Procfile.dev` with any Procfile-compatible
process manager. The web app runs at
[http://localhost:3000](http://localhost:3000), and the worker polls for jobs
outside API routes.

## Render Deployment

The repo now includes a repo-root Render Blueprint at `render.yaml`.

Render service layout:

- `media-translator-web`
  Next.js Web Service using `npm ci --include=dev && npm run build` and
  `npm run start`
- `media-translator-worker`
  Background Worker using `npm ci --include=dev && npm run build` and
  `npm run worker`

The web service health check should target `GET /api/health`.

Environment split for Render:

- Shared:
  `DATABASE_URL`, `NEXT_PUBLIC_SUPABASE_URL`,
  `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`
- Web only:
  `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, `LIPSYNC_WEBHOOK_SECRET`,
  optional `GIT_COMMIT_SHA`
- Worker only:
  provider-selection vars, OpenAI vars, and `WORKER_*` runtime settings

Render caveats:

- Worker-local files remain ephemeral; durable artifacts still live in Supabase
  Storage
- The Blueprint defaults worker staging/output roots to `/tmp/...`
- The worker also runs `npm run build`, so it needs the same build-time
  `NEXT_PUBLIC_*` vars the Next.js app expects
- The Blueprint installs dependencies explicitly during Render builds, including
  dev-time build tooling needed by Next/Tailwind
- `WORKER_LIPSYNC_CALLBACK_URL` should point at the public web webhook URL if
  you enable a non-mock lip-sync provider

## Runtime Requirements

Required shared environment for the web app and worker:

- `DATABASE_URL`
- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- `SUPABASE_SERVICE_ROLE_KEY`

Supabase URL format expectations:

- `NEXT_PUBLIC_SUPABASE_URL` should look like
  `https://<project-ref>.supabase.co`
- `DATABASE_URL` should use the Postgres host, which for hosted Supabase
  typically looks like
  `postgresql://postgres:<password>@db.<project-ref>.supabase.co:5432/postgres`

Worker-specific environment used by the current runtime:

- `WORKER_POLL_INTERVAL_MS`
- `WORKER_HEARTBEAT_INTERVAL_MS`
- `WORKER_QUEUED_SCAN_LIMIT`
- `WORKER_OUTPUT_ROOT_DIR`
- `WORKER_STAGING_ROOT`
- `WORKER_LIPSYNC_CALLBACK_URL`
- `WORKER_STUCK_JOB_THRESHOLD_MS`
- `WORKER_STUCK_JOB_SAMPLE_LIMIT`

Provider selection is env-driven. For the first real provider path, configure:

- `TRANSCRIPTION_PROVIDER`
- `TRANSLATION_PROVIDER`
- `TTS_PROVIDER`
- `OPENAI_API_KEY`

The worker runtime also requires `ffmpeg` on `PATH` plus writable local staging
and output directories.

## Operations

Basic production-hardening tooling is committed in the repo:

- Web health endpoint: `GET /api/health`
- Worker heartbeat logs: emitted periodically while the worker is running
- Stuck-job report: `npm run ops:stuck-jobs`
- Worker env sanity check: `npm run ops:check-worker-env`

Suggested first checks:

1. Hit `http://localhost:3000/api/health` to confirm the web service is alive.
2. Start the worker and watch for:
   - `worker_runtime_started`
   - `worker_heartbeat`
   - `worker_runtime_stopped`
3. Run `npm run ops:stuck-jobs` if jobs appear to stop making progress.
4. Run `npm run test:validation` before deployment-facing changes.

## Validation

Run the focused outcome validation suite with:

```bash
npm run test:validation
```

This covers the core job outcome classes without requiring real provider
credentials or live external services:

- `completed`
- `partial_success`
- `failed`
- `canceled`
- retry as a new attempt

## Scripts

- `npm run dev` starts the local development server
- `npm run dev:web` starts the local Next.js app
- `npm run dev:worker` starts the worker poller for development
- `npm run build` creates a production build
- `npm run start` runs the production server
- `npm run worker` runs the worker service
- `npm run worker:once` runs a single worker pickup/execution cycle
- `npm run ops:stuck-jobs` reports potentially stuck active jobs
- `npm run ops:check-worker-env` reports lightweight worker runtime checks,
  including malformed Supabase URL detection
- `npm run lint` runs ESLint

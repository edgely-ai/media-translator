# Media Translator

Media Translator is a SaaS application for translating video and audio
content into other languages.

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

## Runtime Requirements

Required shared environment for the web app and worker:

- `DATABASE_URL`
- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- `SUPABASE_SERVICE_ROLE_KEY`

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

## Scripts

- `npm run dev` starts the local development server
- `npm run dev:web` starts the local Next.js app
- `npm run dev:worker` starts the worker poller for development
- `npm run build` creates a production build
- `npm run start` runs the production server
- `npm run worker` runs the worker service
- `npm run worker:once` runs a single worker pickup/execution cycle
- `npm run ops:stuck-jobs` reports potentially stuck active jobs
- `npm run ops:check-worker-env` reports lightweight worker runtime checks
- `npm run lint` runs ESLint

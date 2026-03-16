BEGIN;

CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE profiles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email text NOT NULL UNIQUE,
  full_name text,
  stripe_customer_id text UNIQUE,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE plans (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL UNIQUE,
  monthly_credits integer NOT NULL CHECK (monthly_credits >= 0),
  stripe_price_id text UNIQUE,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE jobs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  profile_id uuid NOT NULL REFERENCES profiles(id) ON DELETE RESTRICT,
  plan_id uuid REFERENCES plans(id) ON DELETE SET NULL,
  source_media_path text NOT NULL,
  normalized_media_path text,
  extracted_audio_path text,
  source_language text,
  output_mode text NOT NULL,
  status text NOT NULL DEFAULT 'created',
  duration_seconds integer CHECK (duration_seconds IS NULL OR duration_seconds BETWEEN 0 AND 300),
  estimated_credits integer NOT NULL DEFAULT 0 CHECK (estimated_credits >= 0),
  reserved_credits integer NOT NULL DEFAULT 0 CHECK (reserved_credits >= 0),
  finalized_credits integer NOT NULL DEFAULT 0 CHECK (finalized_credits >= 0),
  error_message text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz,
  CONSTRAINT jobs_output_mode_check CHECK (
    output_mode IN ('subtitles', 'dubbed_audio', 'lip_sync')
  ),
  CONSTRAINT jobs_status_check CHECK (
    status IN (
      'created',
      'queued',
      'normalizing',
      'extracting_audio',
      'transcribing',
      'transcript_ready',
      'translating',
      'generating_subtitles',
      'generating_dubbed_audio',
      'lip_sync_pending',
      'completed',
      'partial_success',
      'failed'
    )
  )
);

CREATE TABLE job_targets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id uuid NOT NULL REFERENCES jobs(id) ON DELETE CASCADE,
  target_language text NOT NULL,
  status text NOT NULL DEFAULT 'pending',
  subtitle_path text,
  dubbed_audio_path text,
  dubbed_video_path text,
  provider_job_id text,
  error_message text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz,
  CONSTRAINT job_targets_status_check CHECK (
    status IN (
      'pending',
      'translating',
      'subtitles_ready',
      'audio_ready',
      'lipsync_requested',
      'completed',
      'failed'
    )
  ),
  CONSTRAINT job_targets_id_job_id_key UNIQUE (id, job_id),
  CONSTRAINT job_targets_job_language_key UNIQUE (job_id, target_language)
);

CREATE TABLE transcript_segments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id uuid NOT NULL REFERENCES jobs(id) ON DELETE CASCADE,
  segment_index integer NOT NULL CHECK (segment_index >= 0),
  source_start_ms integer NOT NULL CHECK (source_start_ms >= 0),
  source_end_ms integer NOT NULL CHECK (source_end_ms > source_start_ms),
  source_text text NOT NULL,
  edited_source_text text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT transcript_segments_id_job_id_key UNIQUE (id, job_id),
  CONSTRAINT transcript_segments_job_segment_key UNIQUE (job_id, segment_index)
);

CREATE TABLE translated_segments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id uuid NOT NULL REFERENCES jobs(id) ON DELETE CASCADE,
  job_target_id uuid NOT NULL,
  transcript_segment_id uuid NOT NULL,
  translated_text text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT translated_segments_job_target_fk
    FOREIGN KEY (job_target_id, job_id)
    REFERENCES job_targets(id, job_id)
    ON DELETE CASCADE,
  CONSTRAINT translated_segments_transcript_segment_fk
    FOREIGN KEY (transcript_segment_id, job_id)
    REFERENCES transcript_segments(id, job_id)
    ON DELETE CASCADE,
  CONSTRAINT translated_segments_target_segment_key UNIQUE (
    job_target_id,
    transcript_segment_id
  )
);

CREATE TABLE credit_ledger (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  profile_id uuid NOT NULL REFERENCES profiles(id) ON DELETE RESTRICT,
  job_id uuid REFERENCES jobs(id) ON DELETE SET NULL,
  entry_type text NOT NULL,
  amount integer NOT NULL,
  description text,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT credit_ledger_entry_type_check CHECK (
    entry_type IN ('reserve', 'finalize', 'release', 'grant', 'adjustment')
  )
);

CREATE TABLE billing_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  profile_id uuid REFERENCES profiles(id) ON DELETE RESTRICT,
  stripe_event_id text NOT NULL UNIQUE,
  stripe_customer_id text,
  event_type text NOT NULL,
  status text NOT NULL DEFAULT 'received',
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  error_message text,
  processed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT billing_events_status_check CHECK (
    status IN ('received', 'processed', 'failed')
  )
);

CREATE INDEX idx_jobs_profile_id ON jobs(profile_id);
CREATE INDEX idx_jobs_plan_id ON jobs(plan_id);
CREATE INDEX idx_jobs_status ON jobs(status);
CREATE INDEX idx_jobs_created_at ON jobs(created_at DESC);

CREATE INDEX idx_job_targets_job_id ON job_targets(job_id);
CREATE INDEX idx_job_targets_status ON job_targets(status);
CREATE INDEX idx_job_targets_provider_job_id ON job_targets(provider_job_id);

CREATE INDEX idx_transcript_segments_job_id_segment_index
  ON transcript_segments(job_id, segment_index);
CREATE INDEX idx_transcript_segments_job_id_start_ms
  ON transcript_segments(job_id, source_start_ms);

CREATE INDEX idx_translated_segments_job_target_id
  ON translated_segments(job_target_id);
CREATE INDEX idx_translated_segments_transcript_segment_id
  ON translated_segments(transcript_segment_id);
CREATE INDEX idx_translated_segments_job_id ON translated_segments(job_id);

CREATE INDEX idx_credit_ledger_profile_id_created_at
  ON credit_ledger(profile_id, created_at DESC);
CREATE INDEX idx_credit_ledger_job_id ON credit_ledger(job_id);
CREATE INDEX idx_credit_ledger_entry_type ON credit_ledger(entry_type);

CREATE INDEX idx_billing_events_profile_id ON billing_events(profile_id);
CREATE INDEX idx_billing_events_status ON billing_events(status);
CREATE INDEX idx_billing_events_created_at ON billing_events(created_at DESC);

INSERT INTO plans (name, monthly_credits)
VALUES
  ('Starter', 120),
  ('Creator', 450),
  ('Pro', 1200);

COMMIT;

BEGIN;

ALTER TABLE jobs
  ADD COLUMN cancel_requested_at timestamptz,
  ADD COLUMN cancel_reason text,
  ADD COLUMN canceled_at timestamptz,
  ADD COLUMN retry_of_job_id uuid REFERENCES jobs(id) ON DELETE SET NULL;

ALTER TABLE jobs
  DROP CONSTRAINT jobs_status_check;

ALTER TABLE jobs
  ADD CONSTRAINT jobs_status_check CHECK (
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
      'failed',
      'canceled'
    )
  );

CREATE INDEX idx_jobs_cancel_requested_at
  ON jobs(cancel_requested_at)
  WHERE cancel_requested_at IS NOT NULL;

CREATE INDEX idx_jobs_retry_of_job_id
  ON jobs(retry_of_job_id)
  WHERE retry_of_job_id IS NOT NULL;

CREATE OR REPLACE FUNCTION create_job_with_credit_reservation(
  p_profile_id uuid,
  p_source_media_path text,
  p_output_mode text,
  p_duration_seconds integer,
  p_estimated_credits integer,
  p_reserved_credits integer,
  p_target_languages text[],
  p_retry_of_job_id uuid DEFAULT NULL
)
RETURNS TABLE (
  job_id uuid,
  status text,
  output_mode text,
  duration_seconds integer,
  estimated_credits integer,
  reserved_credits integer,
  target_count integer
)
LANGUAGE plpgsql
AS $$
DECLARE
  v_job_id uuid;
  v_current_balance integer;
BEGIN
  IF p_reserved_credits < 0 OR p_estimated_credits < 0 THEN
    RAISE EXCEPTION 'credit amounts must be non-negative';
  END IF;

  IF p_target_languages IS NULL OR array_length(p_target_languages, 1) IS NULL THEN
    RAISE EXCEPTION 'target_languages must not be empty';
  END IF;

  SELECT COALESCE(SUM(amount), 0)::int
  INTO v_current_balance
  FROM credit_ledger
  WHERE profile_id = p_profile_id;

  IF v_current_balance < p_reserved_credits THEN
    RAISE EXCEPTION 'insufficient_credits';
  END IF;

  INSERT INTO jobs (
    profile_id,
    source_media_path,
    output_mode,
    duration_seconds,
    estimated_credits,
    reserved_credits,
    retry_of_job_id
  )
  VALUES (
    p_profile_id,
    p_source_media_path,
    p_output_mode,
    p_duration_seconds,
    p_estimated_credits,
    p_reserved_credits,
    p_retry_of_job_id
  )
  RETURNING id INTO v_job_id;

  INSERT INTO credit_ledger (
    profile_id,
    job_id,
    entry_type,
    amount,
    description
  )
  VALUES (
    p_profile_id,
    v_job_id,
    'reserve',
    p_reserved_credits * -1,
    CASE
      WHEN p_retry_of_job_id IS NULL THEN 'Reserved credits for job creation'
      ELSE 'Reserved credits for retry job creation'
    END
  );

  INSERT INTO job_targets (job_id, target_language)
  SELECT v_job_id, language
  FROM unnest(p_target_languages) AS language;

  RETURN QUERY
  SELECT
    jobs.id,
    jobs.status,
    jobs.output_mode,
    jobs.duration_seconds,
    jobs.estimated_credits,
    jobs.reserved_credits,
    cardinality(p_target_languages)::int
  FROM jobs
  WHERE jobs.id = v_job_id;
END;
$$;

COMMIT;

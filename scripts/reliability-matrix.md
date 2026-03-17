# Reliability Matrix

This runbook defines the narrow retry and idempotency verification pass for:

- `T32` worker processing retries
- `T33` reconciliation idempotency
- `T35` Stripe webhook replay safety
- `T28` lip-sync webhook replay safety

Keep this matrix small and explicit. The goal is to verify repeated calls and
duplicate delivery behavior without expanding into a full test framework.

## Setup

Before running the matrix:

- apply the database migrations
- configure Supabase and Stripe environment variables
- make sure a test profile exists in `profiles`
- make sure at least one plan row has a real `stripe_price_id`
- use a disposable test job or test profile for each run when possible

Helpful inspection queries:

```sql
SELECT id, status, output_mode, reserved_credits, finalized_credits, completed_at
FROM jobs
WHERE id = '<job_id>';
```

```sql
SELECT id, target_language, status, subtitle_path, dubbed_audio_path, dubbed_video_path, provider_job_id, error_message
FROM job_targets
WHERE job_id = '<job_id>'
ORDER BY created_at ASC;
```

```sql
SELECT entry_type, amount, description, created_at
FROM credit_ledger
WHERE job_id = '<job_id>'
ORDER BY created_at ASC;
```

```sql
SELECT stripe_event_id, event_type, status, error_message, processed_at
FROM billing_events
ORDER BY created_at DESC
LIMIT 20;
```

## Matrix

### Case 1: Reconcile twice for a completed job

Purpose:
Ensure terminal reconciliation does not add extra `finalize` or `release`
ledger activity on repeated runs.

Setup:
- create or reuse a job whose requested outputs have all succeeded
- confirm the job has a reserve entry in `credit_ledger`

Run:
1. call `reconcileJobOutputs(jobId)` once
2. record the count and totals of `finalize` and `release` entries
3. call `reconcileJobOutputs(jobId)` again
4. compare the ledger again

Pass:
- job status remains `completed`
- no new `release` entry appears
- `finalize` totals do not increase on the second call

Fail:
- duplicate `finalize` or `release` rows appear
- job regresses away from `completed`

### Case 2: Reconcile twice for a failed job

Purpose:
Ensure a fully failed job releases credits once and only once.

Setup:
- use a job with no usable outputs and a reserve entry

Run:
1. call `reconcileJobOutputs(jobId)`
2. record `release` totals
3. call `reconcileJobOutputs(jobId)` again

Pass:
- job status remains `failed`
- `release` totals stay unchanged on the second call
- no `finalize` entry is added

Fail:
- extra `release` rows appear
- a `finalize` entry appears for the failed job

### Case 3: Reconcile twice for a partial-success job

Purpose:
Ensure mixed outcomes finalize only the successful share and release the rest,
without duplicating settlement on retry.

Setup:
- use a job where some targets succeeded and some failed
- verify usable outputs still exist for at least one target

Run:
1. call `reconcileJobOutputs(jobId)`
2. record `finalize` and `release` totals
3. call `reconcileJobOutputs(jobId)` again

Pass:
- job status remains `partial_success`
- `finalize` and `release` totals do not increase on the second call

Fail:
- settlement amounts grow on the second call
- job flips to `failed` despite usable outputs

### Case 4: Replay the same Stripe invoice webhook twice

Purpose:
Ensure duplicate `invoice.paid` delivery does not double-grant credits.

Setup:
- use a Stripe test invoice tied to a known profile and plan
- confirm the plan maps to `plans.stripe_price_id`

Run:
1. deliver the `invoice.paid` webhook once
2. record:
   - matching `billing_events` row
   - matching `grant` ledger entry count and amount
3. replay the exact same webhook payload and signature flow again

Pass:
- the same `billing_events.stripe_event_id` remains the processed record
- only one matching `grant` entry exists for that invoice description
- profile `stripe_customer_id` stays stable

Fail:
- credits are granted twice
- duplicate processed event handling changes linkage unexpectedly

### Case 5: Replay lip-sync completed then failed

Purpose:
Ensure a completed target is not downgraded by a later failed callback.

Setup:
- use a target with a valid `provider_job_id`
- prepare a successful lip-sync webhook payload with `dubbedVideoPath`

Run:
1. send a `completed` lip-sync webhook for the target
2. verify target status becomes `completed`
3. send a later `failed` webhook for the same `provider_job_id`

Pass:
- target remains `completed`
- `dubbed_video_path` remains intact
- job reconciliation does not regress the final output state because of the late failure

Fail:
- target becomes `failed`
- `dubbed_video_path` is cleared or changed incorrectly

### Case 6: Retry processJob after a mid-pipeline failure

Purpose:
Ensure worker retries preserve prior good artifacts and do not duplicate
terminal settlement.

Setup:
- use a queued job that can fail mid-pipeline in a controlled way
- examples:
  - unset a provider env var after normalization
  - force a translation or TTS step to fail after earlier artifacts already exist

Run:
1. call `processJob(db, { jobId })` and let it fail mid-pipeline
2. inspect any artifacts already created under `media/<job_id>/`
3. fix the cause of the failure
4. move the job back to the intended retryable state if your local flow requires it
5. call `processJob(db, { jobId })` again
6. inspect ledger settlement and final artifacts

Pass:
- prior good artifacts remain available after the first failure
- recovered success clears stale `jobs.error_message`
- terminal `finalize` or `release` totals do not duplicate across the retry

Fail:
- earlier good outputs are destroyed by the retry
- stale error text remains after success
- terminal settlement grows incorrectly on repeated processing

### Case 7: Pending targets never settle credits early

Purpose:
Ensure jobs with pending targets do not finalize or release credits
prematurely.

Setup:
- use a job with at least one target still pending or still waiting for
  lip-sync completion

Run:
1. call `reconcileJobOutputs(jobId)` while at least one target is pending
2. inspect `credit_ledger`

Pass:
- reconciliation returns a non-terminal status
- no new `finalize` or `release` row is inserted

Fail:
- settlement occurs before all targets are terminal or intentionally eligible for final reconciliation

## Recording Results

For each case, record:

- case name
- date
- profile or job ID used
- pass or fail
- notes

Suggested table:

```text
| Case | Date | Entity ID | Result | Notes |
|------|------|-----------|--------|-------|
```

## Exit Criteria

The reliability pass is complete when:

- all seven cases have been run at least once
- duplicate settlement does not occur
- duplicate Stripe replay does not double-grant credits
- late lip-sync failure does not regress completed targets
- pending targets do not trigger settlement

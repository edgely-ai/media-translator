# Media Translator — Engineering Constraints

This document defines hard constraints that coding agents must respect
when modifying this repository.

Agents must read:

AGENTS.md  
ARCHITECTURE.md  
CONSTRAINTS.md  

before implementing changes.

These constraints protect system stability and architectural consistency.

---

## 1. Do Not Break the Pipeline Model

The media processing pipeline must remain:

upload  
→ normalize media  
→ extract audio  
→ transcribe speech  
→ translate transcript  
→ generate subtitles  
→ generate dubbed audio  
→ optional lip-sync rendering

Agents must not reorder or remove pipeline stages without explicit instruction.

---

## 2. One Output Mode Per Job

Each job must have exactly one output mode.

Allowed modes:

subtitles  
dubbed_audio  
lip_sync  

Multiple target languages are allowed, but the output mode must remain
consistent across targets.

---

## 3. Heavy Processing Must Not Run in API Routes

API routes must remain lightweight.

They may:

- validate input
- create jobs
- fetch data

They must not:

- run FFmpeg
- run transcription
- run translation
- run lip-sync

All heavy processing must run in the worker.

---

## 4. Business Logic Must Not Be in UI Components

React components must not contain business logic.

Business logic must live in:

lib/

Examples:

GOOD  
lib/jobs/processJob.ts

BAD  
components/Upload.tsx performing job orchestration

---

## 5. Database Schema Changes

Database schema lives in:

database/migrations/

Agents must:

- use SQL migrations
- avoid destructive schema changes
- preserve foreign keys
- preserve referential integrity

Primary keys must use UUID.

Timestamps must use `timestamptz`.

---

## 6. Credit Accounting Must Be Ledger-Based

Credits must be tracked in `credit_ledger`.

Agents must not modify user credit balances directly.

Correct pattern:

reserve credits  
→ finalize credits  
→ release unused credits

Ledger entries must remain append-only.

---

## 7. Jobs Must Support Partial Success

Jobs must support partial success.

Example:

subtitles succeed  
dubbed audio succeed  
lip sync fails

Job status must become:

partial_success

Agents must not mark the entire job as failed when usable outputs exist.

---

## 8. Media Must Be Normalized

Before any AI processing occurs:

media must be normalized using FFmpeg.

Example conversions:

video → normalized mp4  
audio → mono wav  

This prevents pipeline failures.

---

## 9. Output Storage Layout

All generated files must follow structured storage paths.

Example:

media/{job_id}/source.mp4  
media/{job_id}/audio.wav  
media/{job_id}/subtitles/en.srt  
media/{job_id}/dubbed/fr.wav  
media/{job_id}/lip_sync/fr.mp4  

Agents must not store files in random paths.

---

## 10. Code Size Limits

Modules should remain small.

Guidelines:

- prefer files under ~300 lines
- split responsibilities across modules
- avoid large mixed-responsibility files

---

## 11. Dependency Policy

Agents must not introduce new dependencies unless necessary.

Before adding dependencies:

- prefer built-in Node.js APIs
- reuse existing libraries

Large frameworks must not be added without explicit approval.

---

## 12. TypeScript Rules

TypeScript must remain strict.

Agents must:

- avoid `any`
- define interfaces and types
- keep shared types in `types/`

---

## 13. Logging Requirements

Important steps must log:

- job_id
- step name
- duration
- error messages

Logs must support debugging pipeline failures.

---

## 14. V1 Product Constraints

Version 1 limitations:

- maximum video duration: 5 minutes
- lip-sync intended for talking-head videos
- subtitles and dubbed audio must work independently of lip-sync

Agents must not expand scope unless explicitly instructed.

---

## 15. Security Rules

Agents must not:

- expose API keys
- commit secrets
- disable authentication checks
- weaken input validation

Environment variables must remain in `.env.local`.

---

## Summary

Agents must respect:

ARCHITECTURE.md → how the system works  
AGENTS.md → coding guidance  
CONSTRAINTS.md → non-negotiable rules

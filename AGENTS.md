# Media Translator — Agent Instructions

This repository contains the source code for **Media Translator**, a
SaaS application that translates video and audio content into other
languages.

This file defines how coding agents (such as Codex) should behave when
working in this repository.

Agents must read the project documentation before implementing features.

---

## Project Documentation

Agents must read the following documents before implementing changes.

ARCHITECTURE.md  
Defines the full system architecture including:

- system components
- database model
- worker architecture
- credit accounting
- storage layout

PIPELINE.md  
Defines the **exact media processing pipeline** including:

- job lifecycle
- pipeline stages
- transcript model
- translation model
- subtitle generation
- dubbed audio generation
- lip-sync integration
- partial success behavior
- retry rules

CONSTRAINTS.md  
Defines non-negotiable engineering constraints including:

- architecture rules
- credit accounting rules
- worker responsibilities
- database migration rules
- dependency policies

README.md  
Contains development setup instructions.

AGENTS.md  
Contains agent instructions and coding rules.

---

## Project Overview

Media Translator is a SaaS application that converts spoken media into
other languages.

Users upload media and select:

- target language(s)
- output mode

Supported output modes:

- subtitles
- dubbed_audio
- lip_sync

Media is processed through a pipeline defined in **PIPELINE.md**.

---

## Technology Stack

Frontend

- Next.js (App Router)
- React
- TypeScript
- Tailwind CSS
- shadcn/ui

Backend

- Next.js API routes
- Supabase PostgreSQL
- Supabase Storage

Processing

- FFmpeg
- Speech-to-Text provider
- Translation provider
- Text-to-Speech provider
- Lip-sync provider

Billing

- Stripe subscriptions

---

## Repository Structure

app/  
Next.js routes and API handlers.

components/  
Reusable UI components.

lib/  
Core application logic.

lib/ai/  
AI provider integrations.

lib/ffmpeg/  
Media processing utilities.

lib/jobs/  
Job orchestration logic.

lib/credits/  
Credit accounting logic.

lib/db/  
Database access helpers.

lib/storage/  
Storage utilities.

worker/  
Background processing worker.

database/  
SQL migrations.

types/  
Shared TypeScript types.

scripts/  
Utility scripts.

---

## Coding Principles

Agents must follow these principles.

1. Keep modules small and focused.

2. Business logic must live in `lib/`.

3. API routes must remain thin.

4. Heavy processing must run in the worker.

5. Avoid mixing UI logic with business logic.

6. Prefer reusable functions.

7. Avoid unnecessary dependencies.

8. Maintain strict TypeScript types.

---

## Database Rules

Database schema lives in:

database/migrations/

Agents must:

- use SQL migrations
- maintain referential integrity
- use UUID primary keys
- use `timestamptz` timestamps
- add indexes where appropriate

Agents must not modify existing migrations unless explicitly instructed.

---

## Worker Rules

Media processing must run in the worker.

Worker responsibilities include:

- executing pipeline stages
- updating job status
- writing output files
- handling partial success
- finalizing or releasing credits

Worker implementation lives in:

worker/
worker/handlers/

Pipeline behavior must follow **PIPELINE.md**.

---

## Error Handling

Pipeline steps must handle errors gracefully.

If a step fails:

- store error_message
- update job state
- allow partial success when possible

Failures must not destroy successful outputs.

---

## Logging

Important operations must log:

- job_id
- step name
- start time
- completion time
- provider response IDs
- error messages

Logs are required for debugging pipeline failures.

---

## Development Constraints

Agents must respect rules defined in **CONSTRAINTS.md**.

Examples:

- heavy processing must not run in API routes
- credit balances must not be mutated directly
- media must be normalized before AI processing
- pipeline stages must not be reordered

---

## V1 Product Constraints

Version 1 limitations:

- maximum video duration: 5 minutes
- lip-sync intended for talking-head videos
- subtitles and dubbed audio must work independently of lip-sync

Agents must not expand scope unless instructed.

---

## Definition of Done

A change is complete when:

- TypeScript compiles successfully
- database relationships remain valid
- pipeline stages update job status correctly
- modules remain readable and modular
- error handling is implemented
- changes follow ARCHITECTURE.md, PIPELINE.md, and CONSTRAINTS.md

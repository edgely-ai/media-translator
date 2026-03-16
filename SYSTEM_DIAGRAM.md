# Media Translator — System Diagram

This document shows the high-level architecture of the Media Translator application.

---

## 1. Full System Overview

```text
┌──────────────────────────────────────┐
│              USER / BROWSER          │
│  - landing page                      │
│  - dashboard                         │
│  - upload form                       │
│  - transcript editor                 │
│  - results page                      │
└──────────────────────────────────────┘
                    │
                    ▼
┌──────────────────────────────────────┐
│         NEXT.JS FRONTEND (app/)      │
│  - pages                             │
│  - UI components                     │
│  - client-side state                 │
└──────────────────────────────────────┘
                    │
                    ▼
┌──────────────────────────────────────┐
│          NEXT.JS API ROUTES          │
│  - upload init                       │
│  - create job                        │
│  - fetch job                         │
│  - save transcript edits             │
│  - Stripe checkout                   │
│  - Stripe webhook                    │
│  - lip-sync webhook                  │
└──────────────────────────────────────┘
                    │
        ┌───────────┼───────────┐
        │           │           │
        ▼           ▼           ▼
┌──────────────┐ ┌──────────────┐ ┌─────────────────┐
│  POSTGRES DB │ │   STORAGE    │ │     STRIPE      │
│ (Supabase)   │ │ (Supabase)   │ │  subscriptions  │
│              │ │              │ │  + trial        │
└──────────────┘ └──────────────┘ └─────────────────┘
        │
        ▼
┌──────────────────────────────────────┐
│           JOB QUEUE / WORKER         │
│  - enqueue jobs                      │
│  - process pipeline                  │
│  - update statuses                   │
│  - finalize/release credits          │
└──────────────────────────────────────┘
                    │
                    ▼
┌─────────────────────────────────────────────────────────┐
│                  MEDIA / AI PROVIDERS                   │
│  - FFmpeg normalization                                │
│  - speech-to-text                                      │
│  - translation                                         │
│  - text-to-speech                                      │
│  - lip-sync provider                                   │
└─────────────────────────────────────────────────────────┘
                    │
                    ▼
┌──────────────────────────────────────┐
│            GENERATED OUTPUTS         │
│  - subtitles (.srt)                  │
│  - dubbed audio                      │
│  - lip-synced video                  │
└──────────────────────────────────────┘

# Hydrogenera Sales Tracker

A simple Next.js app for tracking electrolyser sales leads from first contact to commissioning, styled after [hydrogenera.eu](https://hydrogenera.eu/).

## Features

- **Three project stages**: New Lead, Under Development, Commissioned
- **Filtering**: by stage, country, system size, and free-text search
- **Project pages**: key facts, activity timeline, and update posting
- **Stage changes via comments**: posting an update can also move the project to a new stage
- **Living summary**: each project's summary paragraph is regenerated automatically after every comment. With an OpenAI API key configured it is AI-generated; without one it falls back to a built-in rule-based generator
- **Hydr AI voice/text assistant**: natural conversational control across the CRM. It can summarize all or selected projects, create and edit projects/prospects/tasks/contacts, manage pipeline activity, Gantt schedules, finance and warehouse data, and continue multi-step data entry by voice or typed replies. Its reads and writes are limited by the signed-in user's existing permissions.

## AI summaries

Living project summaries are off by default. Enable them in `.env.local` and restart the dev server:

```
NEXT_PUBLIC_AI_PROJECT_SUMMARY=true
OPENAI_API_KEY=sk-...
```

Without an API key the UI still shows rule-based summaries when the feature flag is on. Optional: `OPENAI_MODEL` (default `gpt-5.4-mini`) and `OPENAI_BASE_URL` (default OpenAI; any OpenAI-compatible endpoint works, e.g. a local Ollama server). The key stays server-side — the browser only calls the app's own `/api/summarize` route.

## Hydr AI voice assistant

The voice assistant uses the OpenAI Realtime API over WebRTC. The standard OpenAI API key remains server-side; the browser sends its WebRTC SDP offer to the app's `/api/ai/voice/session` route.

Enable it in `.env.local` and restart/rebuild the app:

```
NEXT_PUBLIC_AI_VOICE=true
OPENAI_API_KEY=sk-...
```

Optional server-side settings:

```
OPENAI_REALTIME_MODEL=gpt-realtime-2.1
OPENAI_REALTIME_VOICE=marin
```

If `OPENAI_BASE_URL` is set, the realtime route uses that base URL too; the endpoint must support `/v1/realtime/calls`.

Browser microphone access requires a secure context. `http://localhost` works for local testing, but opening the CRM from another device over a plain `http://192.168.x.x` LAN URL will normally block microphone access; use HTTPS for LAN/mobile voice testing.

### Hydr AI actions

Hydr AI uses the same application stores and permission model as the manual UI. Depending on the signed-in user's permissions it can:

- Summarize all accessible projects, or only user-selected projects, with latest updates, stage, open actions and next steps
- Search/read/create/edit projects, pipeline fields, project comments, tasks, contacts, follow-up reminders and attachment metadata
- Create and maintain Prospecting companies/contacts, qualification data, outreach, follow-ups and prospecting strategies
- Create, read and edit project Gantt phases, activities and deadlines, including planned/actual dates, durations, owners, WBS/status and whole-schedule shifts
- Read/edit project finance, payments, expenses, milestones and schedule-generated finance only when the user has the same Finance/EU-RnD access as the UI
- Read/edit warehouse inventory, lots, catalog items/groups and BOMs only when the user has Warehouse permission
- Manage the signed-in user's personal To-Dos and notifications
- Continue multi-step forms conversationally: Hydr AI keeps fields already supplied and asks only for genuinely required missing values; the answer can be spoken or typed

Destructive actions are only performed when explicitly requested. Viewer accounts cannot use Hydr AI. New local file uploads/imports still require the browser file picker, and account/password administration remains outside the conversational CRM tool surface.

The assistant executes writes through the existing CRM store methods, so change history, notifications, Supabase persistence, task assignment behaviour and summary refreshes follow the same paths as manual UI actions.

## Fireflies meeting inbox (localhost-safe)

Hydr can import completed Fireflies transcripts without exposing the CRM to the public internet. A local polling worker makes outbound HTTPS requests through the Hydr server, stores each Fireflies transcript once in a review inbox, and leaves it there until Hydr AI reconciles it with the current CRM.

Apply `supabase/migration-056-fireflies-meeting-inbox.sql`, then add these server-side values to `.env.local`:

```
FIREFLIES_API_KEY=your-fireflies-api-key
FIREFLIES_POLL_SECRET=use-a-long-random-local-secret
FIREFLIES_POLL_INTERVAL_MS=300000
FIREFLIES_IMPORT_LOOKBACK_DAYS=30
FIREFLIES_IMPORT_BATCH_SIZE=10
```

`npm run dev` now starts both Next.js and the local Fireflies poller. The default poll interval is five minutes. The poller calls only `http://127.0.0.1:3000` locally and Fireflies' outbound API; Fireflies never needs an inbound URL to the Hydr machine.

Optional commands:

```bash
npm run fireflies:poll:once
npm run fireflies:poll
```

When an admin opens Hydr AI and actionable meetings are waiting, the assistant starts with the oldest meeting. It reads the stored transcript, compares it with current CRM records, ignores already-accounted-for information, applies clear net-new updates, and keeps ambiguous/conflicting items in `needs-clarification` until the user resolves them by voice or text. Meetings are only marked `processed` after the reconciliation is complete, with a concise summary of what changed and links to affected project IDs.

Meeting review is deliberately admin-only in this first version so imported transcript contents cannot bypass the CRM's existing area permissions. Per-meeting/per-user transcript access can be added later if needed.

## Data storage

CRM data uses Supabase when the Supabase environment variables are configured, with local browser fallbacks retained for supported offline/development data. Voice actions call the same existing store methods as the manual UI instead of writing to a separate AI database path.

## Development

```bash
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

## Structure

- `src/lib/types.ts` – data model (projects, comments, stages)
- `src/lib/store.tsx` – CRM store + persistence actions
- `src/lib/summary.ts` – auto-summary generator
- `src/lib/seed.ts` – sample data
- `src/app/page.tsx` – dashboard with filters
- `src/app/projects/[id]/page.tsx` – project detail page
- `src/components/VoiceAssistant.tsx` – WebRTC voice UI, CRM tool execution and ambiguity checks
- `src/app/api/ai/voice/session/route.ts` – server-side OpenAI Realtime session bootstrap

# Hydrogenera Sales Tracker

A simple Next.js app for tracking electrolyser sales leads from first contact to commissioning, styled after [hydrogenera.eu](https://hydrogenera.eu/).

## Features

- **Three project stages**: New Lead, Under Development, Commissioned
- **Filtering**: by stage, country, system size, and free-text search
- **Project pages**: key facts, activity timeline, and update posting
- **Stage changes via comments**: posting an update can also move the project to a new stage
- **Living summary**: each project's summary paragraph is regenerated automatically after every comment. With an OpenAI API key configured it is AI-generated; without one it falls back to a built-in rule-based generator
- **Hydr AI voice assistant (v1)**: natural speech-to-speech CRM control for finding projects, reading project context, adding project updates, creating/assigning tasks and reminders, and changing project stages. Ambiguous project/person/date requests are clarified conversationally before a write.

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

### Voice v1 actions

- Search for a project by project name, client, country, or city
- Read the current project details, recent updates, and open tasks
- Add a project update/comment
- Create a project task/reminder with an optional due date
- Resolve and assign a task to a team member
- Change a project stage
- Ask a short spoken follow-up when the project, assignee, or date is ambiguous
- Accept typed CRM requests in the same assistant panel for testing/fallback

The assistant executes writes through the existing CRM store methods, so comments, tasks, assignment notifications, change history, Supabase persistence, and AI-summary refreshes follow the same path as manual UI actions. Viewer accounts cannot use voice write actions.

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

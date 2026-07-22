# Hydrogenera Sales Tracker

A simple Next.js app for tracking electrolyser sales leads from first contact to commissioning, styled after [hydrogenera.eu](https://hydrogenera.eu/).

## Features

- **Three project stages**: New Lead, Under Development, Commissioned
- **Filtering**: by stage, country, system size, and free-text search
- **Project pages**: key facts, activity timeline, and update posting
- **Stage changes via comments**: posting an update can also move the project to a new stage
- **Living summary**: each project's summary paragraph is regenerated automatically after every comment. With an OpenAI API key configured it is AI-generated; without one it falls back to a built-in rule-based generator

## AI summaries

Put your API key in `.env.local` (created at the project root) and restart the dev server:

```
OPENAI_API_KEY=sk-...
```

Optional: `OPENAI_MODEL` (default `gpt-5.4-mini`) and `OPENAI_BASE_URL` (default OpenAI; any OpenAI-compatible endpoint works, e.g. a local Ollama server). The key stays server-side — the browser only calls the app's own `/api/summarize` route.

## Data storage

Data is currently stored in the browser's `localStorage` (key `hydrogenera-lead-tracker-v1`) and seeded with sample projects on first run. A real database can be plugged in later by replacing `src/lib/store.tsx` with API-backed calls.

## Development

```bash
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

## Structure

- `src/lib/types.ts` – data model (projects, comments, stages)
- `src/lib/store.tsx` – localStorage-backed store + React context
- `src/lib/summary.ts` – auto-summary generator
- `src/lib/seed.ts` – sample data
- `src/app/page.tsx` – dashboard with filters
- `src/app/projects/[id]/page.tsx` – project detail page

# CRM Briefings

The Briefings feature is intentionally separate from Hydr AI chat/voice.

## What it does

- Adds a dedicated `Briefings` permission.
- Adds `/briefings` to the main CRM navigation for users with that permission.
- Stores generated Daily, Weekly, and Monthly CRM summaries in `public.crm_briefings`.
- Shows the latest Daily briefing expanded by default.
- Shows current Weekly and Monthly briefings collapsed by default.
- Preserves completed periods in a searchable-by-type history view.
- Reads briefings through an authenticated server API; normal users cannot write briefing records from the UI.

## Period rules

- **Daily:** generated every day at 20:00 Europe/Sofia and summarizes CRM activity since the previous daily run.
- **Weekly:** starts Monday and is refreshed every evening through the current day.
- **Monthly:** starts on the first Monday of the current month and is refreshed every evening through the current day. If the current date precedes the first Monday, use the first calendar day of the month as the temporary start so no activity is lost.

The same 20:00 scheduled task refreshes all three periods.

## Database setup

Run:

`supabase/migration-060-briefings.sql`

in the Supabase SQL Editor before enabling the scheduled generation task.

The table is RLS-protected and intentionally not exposed to the browser's anon/authenticated Supabase roles. The app reads it through `/api/briefings` using the server service-role client after checking the user's Briefings permission.

## Expected generator output

Each upsert should populate:

- `briefing_type`: daily / weekly / monthly
- `period_start`, `period_end`
- `title`
- `summary`: readable plain text with optional `##` headings and `- ` bullet lines
- `highlights`: JSON array of short important points
- `metrics`: JSON object of useful counts
- `generated_at`, `updated_at`
- `generated_by = 'chatgpt-scheduled-task'`
- `source_from`, `source_to`

Use an UPSERT on `(briefing_type, period_start)` so the active weekly/monthly rows evolve during the period while old periods remain as history.

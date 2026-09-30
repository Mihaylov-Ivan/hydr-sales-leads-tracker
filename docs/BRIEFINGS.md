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

## Who generates briefings

Daily / Weekly / Monthly rows are written into Supabase by an **external ChatGPT scheduled task** (not by this Next.js app). The CRM only reads them for display and for the evening Project-updates email.

## Period rules

- **Daily:** written every day at 20:00 Europe/Sofia; summarizes CRM activity since the previous daily run.
- **Weekly:** starts Monday and is refreshed every evening through the current day.
- **Monthly:** starts on the first Monday of the current month and is refreshed every evening through the current day. If the current date precedes the first Monday, use the first calendar day of the month as the temporary start so no activity is lost.

## Daily Project-updates email (20:30)

After ChatGPT has written the Daily briefing, a local Windows task at **20:30** calls the CRM backend, which:

1. loads today's Daily row from `crm_briefings` (Europe/Sofia date),
2. extracts only the `## Project updates` section,
3. emails it via Resend to `i.mihaylov@hydrogenera.eu` (configurable).

### Env (`.env.local`)

```env
RESEND_API_KEY=re_your_key_here
BRIEFING_EMAIL_FROM=CRM Briefing <onboarding@resend.dev>
BRIEFING_EMAIL_TO=i.mihaylov@hydrogenera.eu
AI_SUMMARY_CRON_SECRET=generate-a-long-random-secret
CRM_BASE_URL=http://127.0.0.1:3000
```

Optional: `BRIEFING_EMAIL_CRON_SECRET` (falls back to `AI_SUMMARY_CRON_SECRET`), `BRIEFING_EMAIL_SUBJECT`.

For production, verify `hydrogenera.eu` in Resend and set e.g. `BRIEFING_EMAIL_FROM=CRM Briefing <crm@hydrogenera.eu>`.

### Manual test

With the CRM server running:

```powershell
npm run briefings:email-daily
```

If today's daily is not in the DB yet, use `--force` to email the latest daily row:

```powershell
npm run briefings:email-daily -- --force
```

### Install Windows task (20:30 local)

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\install-briefing-email-task.ps1 -Time "20:30"
```

The CRM server must be running at `CRM_BASE_URL` when the task fires.

## Database setup

Run:

`supabase/migration-060-briefings.sql`

in the Supabase SQL Editor before enabling the scheduled generation task.

The table is RLS-protected and intentionally not exposed to the browser's anon/authenticated Supabase roles. The app reads it through `/api/briefings` using the server service-role client after checking the user's Briefings permission.

## Expected generator output (ChatGPT task)

Each upsert should populate:

- `briefing_type`: daily / weekly / monthly
- `period_start`, `period_end`
- `title`
- `summary`: readable plain text with optional `##` headings and `- ` bullet lines (must include `## Project updates` for the email)
- `highlights`: JSON array of short important points
- `metrics`: JSON object of useful counts
- `generated_at`, `updated_at`
- `generated_by = 'chatgpt-scheduled-task'`
- `source_from`, `source_to`

Use an UPSERT on `(briefing_type, period_start)` so the active weekly/monthly rows evolve during the period while old periods remain as history.

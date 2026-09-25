# Hydr AI integration

This branch adds two CRM-safe AI workflows.

## 1. Pasted email -> proposal queue -> human approval

The Microsoft mailbox does not need to be connected.

In Hydr AI chat, paste the client email and ask Hydr AI to review it for CRM changes. Hydr AI must:

1. resolve the existing project,
2. read the current CRM state,
3. compare the email with that state,
4. ignore repeated/non-CRM information,
5. save only meaningful net-new changes to the proposal queue,
6. flag ambiguity/conflicts instead of guessing,
7. wait for explicit user approval before applying any proposal.

The queue is stored in `public.ai_suggested_updates`. The raw email body is **not** stored in the queue; only a SHA-256 hash, a short provenance excerpt, and the structured proposed changes are retained.

Supported proposal types:

- project update/comment
- canonical project-field change
- project task
- add/update project contact
- stage change
- clarification required

## 2. CRM-only project summaries

The existing `projects.ai_summary` remains the displayed summary field. Summaries now use CRM data only:

- project core fields
- update/comment history
- project action items
- contacts
- file metadata
- Gantt phases, activities and deadlines

Finance and warehouse data are intentionally excluded from this general summary path.

Hydr AI can regenerate one project summary or all accessible project summaries. A server endpoint can also refresh all non-warehouse project summaries for the daily job.

## Setup

Apply:

`supabase/migration-057-ai-integration.sql`

Then ensure `.env.local` contains:

```env
NEXT_PUBLIC_AI_PROJECT_SUMMARY=true
OPENAI_API_KEY=your-openai-api-key
SUPABASE_SERVICE_ROLE_KEY=your-supabase-service-role-key
AI_SUMMARY_CRON_SECRET=generate-a-long-random-secret
CRM_BASE_URL=http://127.0.0.1:3000
```

The existing `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, and auth/session configuration remain unchanged.

Optional:

```env
OPENAI_MODEL=gpt-5.4-mini
AI_PROJECT_SUMMARY_CONCURRENCY=3
```

## Test manually

With the CRM running:

```powershell
npm run summaries:refresh
```

Then test Hydr AI:

- Paste a real client email and ask: "Review this email and suggest CRM updates."
- Confirm that suggestions are queued but CRM data is unchanged.
- Say: "Approve suggestion 1."
- Confirm only that proposal is applied.
- Ask: "Update all project summaries."
- Confirm `projects.ai_summary` and `ai_summary_updated_at` update.

## Install the daily Windows task

Choose the desired local time, then run PowerShell from the repository:

```powershell
powershell -ExecutionPolicy Bypass -File .\\scripts\\install-summary-refresh-task.ps1 -Time "06:30"
```

The installer does not merge or deploy anything. It creates a local Windows Scheduled Task that runs `npm run summaries:refresh`. The CRM server must be running at `CRM_BASE_URL` when the task fires.

# Authentication & permissions

## Backup before migrations

```powershell
$env:SUPABASE_DB_URL = "postgresql://postgres.[REF]:[PASSWORD]@.../postgres"
.\scripts\backup-supabase.ps1
```

Requires `pg_dump` on PATH. Dumps go to `backups/supabase-YYYYMMDD-HHmmss.sql`.

## Apply migration 037

Run [`supabase/migration-037-user-auth-permissions.sql`](../supabase/migration-037-user-auth-permissions.sql) in the Supabase SQL Editor.

## Set passwords

```powershell
node scripts/seed-admin-password.mjs admin "YourSecurePassword"
node scripts/seed-admin-password.mjs andrew "TempPass123"
```

Paste the printed `UPDATE` SQL into the Supabase SQL Editor for each user.

## Environment variables

| Variable | Where | Purpose |
|----------|--------|---------|
| `SESSION_SECRET` | server | Enables auth; signs session cookies |
| `SUPABASE_SERVICE_ROLE_KEY` | server only | Login / user admin APIs (never expose to client) |
| `NEXT_PUBLIC_SUPABASE_URL` | public | Supabase project URL |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | public | Client data access |

`SITE_PASSWORD` is no longer used.

## Permission types

- **sales** — Prospecting, Sales Projects, Metrics
- **finance** — Expenses, Finance, CSV import/export
- **warehouse** — Warehouse
- **production** — Production
- **all users** — own To-Dos page
- **admin** — everything + Users admin (`/admin/users`)

Existing roster members (Andrew, Maria, Daniel, Irina) are seeded with **sales**. Admin is `username=admin` (`u-admin`).

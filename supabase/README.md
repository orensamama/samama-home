# Database migrations

Every database change is a numbered SQL file in `supabase/migrations/`.
**Never edit the live database by hand in the SQL Editor** — add a new
migration file instead, and it is applied automatically.

## How it reaches the live database

`.github/workflows/supabase-migrate.yml` runs on every push to `main` that
touches `supabase/migrations/**`. It links the Supabase project, marks the
legacy migrations as applied, and runs `supabase db push`, which applies only
the migrations the database hasn't seen yet.

### One-time setup (required for the automation to run)

GitHub repo → Settings → Secrets and variables → Actions → New repository secret:

| Secret | Where to find it |
| --- | --- |
| `SUPABASE_ACCESS_TOKEN` | https://supabase.com/dashboard/account/tokens |
| `SUPABASE_DB_PASSWORD` | Project Settings → Database (the DB password) |
| `SUPABASE_PROJECT_ID` | The `xxxx` in `https://xxxx.supabase.co` |

Until these exist the workflow only prints a warning and skips (it never fails
the push). After adding them, run the workflow once from the Actions tab
("Run workflow") to apply anything pending.

## Legacy migrations 0001–0011 are frozen

They were applied by hand before the CLI was set up, and some of them
(`0004`, `0008`) **drop tables and delete seed data**. They must never run
against the live database again. The pipeline therefore:

1. marks `0001`–`0011` as already applied (`supabase migration repair`), and
2. does a `--dry-run` first and **aborts** if the CLI still wants to run any of them.

Migrations `0012` and later are written to be idempotent (safe to run on a
database where they were already applied manually).

## Adding a migration

```bash
npm run db:new -- my_change      # creates supabase/migrations/<timestamp>_my_change.sql
```

The timestamped name sorts after `0016` and is applied normally (or name it `0017_...` by hand). Keep it idempotent
(`if not exists`, `drop policy if exists` + `create policy`), and never
`drop`/`delete` existing user data.

## Running it from your own machine (optional)

```bash
npm run db:link        # asks for the project ref + DB password
npm run db:baseline    # one-time: mark 0001-0011 as applied
npm run db:push        # apply pending migrations
```

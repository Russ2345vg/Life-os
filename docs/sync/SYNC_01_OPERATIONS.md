# SYNC-01 operations

## Local TypeScript verification

From `D:\LifeOS-App`:

```powershell
npm run test:target -- src/infrastructure/persistence/indexed-db/LifeOsIndexedDb.test.ts src/infrastructure/sync/LifeOsSyncRegistry.test.ts src/infrastructure/sync/LifeOsLocalStoragePolicy.test.ts src/infrastructure/sync/IndexedDbSnapshotService.test.ts src/infrastructure/sync/supabase/SupabaseConfig.test.ts src/infrastructure/sync/supabase/createLifeOsSupabaseClient.test.ts
npm run verify
npm run test:e2e
```

E2E is required at this stage because IndexedDB schema/backward compatibility changes.

## Local Supabase schema and policy verification

Prerequisites: Supabase CLI and a running Docker-compatible container engine. No LifeOS user database is read or copied.

```powershell
supabase start
supabase db reset
supabase test db
supabase stop
```

`db reset` applies `supabase/migrations/20260903000000_sync_01_foundation.sql` only to the CLI-owned local database. `supabase test db` runs `supabase/tests/database/sync_01_foundation_test.sql`.

## Hosted project application

Create/select the dedicated LifeOS Sync project in the Supabase dashboard first. Copy its non-secret project reference from the dashboard URL, then run:

```powershell
$env:LIFEOS_SUPABASE_PROJECT_REF = Read-Host 'Supabase LifeOS project ref'
supabase login
supabase link --project-ref $env:LIFEOS_SUPABASE_PROJECT_REF
supabase db push --linked
```

Put the project URL and publishable key only in ignored `.env.local` using the two names from `.env.example`. Never put a service-role key, database password, or management token in a Vite variable or tracked file.

After application, run `supabase test db` against the local reset environment and use the dashboard SQL/policy inspection only as a secondary hosted confirmation. Do not upload LifeOS records or files during SYNC-01.

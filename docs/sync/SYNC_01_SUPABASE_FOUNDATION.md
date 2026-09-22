# SYNC-01 Supabase foundation

## Runtime boundary

`@supabase/supabase-js` 2.112.4 is present only behind `src/infrastructure/sync/supabase/createLifeOsSupabaseClient.ts`. The factory is not imported by `main`, `App`, providers, composition, product repositories, commands, or pages.

Only these public environment names are accepted:

- `VITE_LIFEOS_SUPABASE_URL`
- `VITE_LIFEOS_SUPABASE_PUBLISHABLE_KEY`

Missing values disable the client; partial/invalid values fail closed. Auth session persistence, automatic token refresh, and URL session detection are disabled. Constructing the dormant client performs no request and creates no realtime subscription. `.env.example` contains empty values only.

## Database migration

`supabase/migrations/20260903000000_sync_01_foundation.sql` creates:

- membership/control: `sync_spaces`, `devices`, `pairing_invites`, `key_envelopes`;
- encrypted event/current state: `sync_events`, `sync_objects`, `device_cursors`;
- encrypted file metadata: `attachment_metadata`, `snapshot_metadata`.

User content columns are ciphertext/nonce only. Server-visible fields are opaque UUIDs, revisions, key epochs, HLC, tombstone/status flags, sequence numbers, hashes, sizes, opaque storage paths, and timestamps. There are no goal/project/journal titles, bodies, filenames, or plaintext attachment content.

`sync_events.sequence` is a generated identity and `event_id` is unique. The migration creates no users, devices, spaces, invites, events, objects, files, or snapshots.

## Authorization and storage

All nine public tables have RLS enabled and forced. `anon` receives no table privileges. SYNC-01 grants authenticated clients no direct insert/update/delete privileges or write policies. Eight tables expose only membership-scoped reads; `pairing_invites` remains completely client-locked. Key envelopes are additionally restricted to the active recipient device. The `private.is_active_sync_device(space_id)` helper requires `auth.uid()` to map to an active device in the same space. Because SYNC-02 has not created device identities, the stage is effectively default-deny. Sensitive transitions and data writes require later narrow RPC/policy migrations and are not pre-authorized here.

Storage buckets:

- `lifeos-attachments` — private;
- `lifeos-snapshots` — private.

One read-only storage policy requires one of these buckets, a UUID-shaped first path segment, and active membership in that space. No client upload/update/delete policy, public URL, or unconditional policy exists in SYNC-01.

## Current external status

At audit time the Supabase CLI was not installed, no `supabase/` configuration existed, and no LifeOS project was linked. The migration and pgTAP contract are reproducible, but they have not been applied to a hosted/local Supabase database. No plaintext LifeOS data or other data was uploaded.

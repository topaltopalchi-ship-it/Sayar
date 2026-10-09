# Cloud backup and phone OTP setup

## Architecture
- Local-first business records stay in IndexedDB (`sayar-db`) and continue to work offline.
- Supabase Auth sends an SMS one-time code; users sign in with their phone in international E.164 format.
- `src/cloud-backup.ts` uploads/downloads a full versioned snapshot to `public.user_backups`.
- Row Level Security binds every backup row to `auth.uid()`. The client never uses a service-role secret.
- Restoring is explicit and replaces local business-data stores; the UI must confirm this with the user first.
- The access session is kept in `sessionStorage` for this first phase, so a new browser session may require signing in again. The cloud backup remains available after re-authentication.

## Provisioning required (not possible from this repository alone)
1. Create a Supabase project in the account controlled by the product owner.
2. Run `supabase/migrations/202610090001_cloud_backups.sql` in its SQL editor.
3. Enable Phone Auth and configure an SMS provider/template in Supabase Auth. SMS delivery may incur charges and requires provider credentials.
4. Add `VITE_SUPABASE_URL` and the publishable/anon key to the deployment environment; never add a service-role key.
5. Test two different phone numbers: each must be unable to read or overwrite the other's backup.
6. Test OTP expiry/rate limits, offline edits, restore on a fresh device, and large backups before release.

## Current implementation boundary
The authenticated SMS and cloud backup APIs are implemented as a foundation, but this repository change does not provision a Supabase project, configure a real SMS provider, or connect a backup/restore screen to the app yet. Do not claim automatic backups until UI integration and end-to-end tests are complete. No APK is built by this change.

# Supabase + Google sign-in setup

One-time steps to enable optional login + cloud sync. The app works fully
without these (local-only mode); the sign-in button appears once the env vars
are set.

## 1. Supabase project
- A project is created and the `list_entries` migration
  (`supabase/migrations/0001_list_entries.sql`) is applied.
- Copy the project's **URL** and **anon public key** (Project Settings → API).

## 2. Env vars
Add to `.env.local` (local dev) and to Vercel (Project → Settings → Environment
Variables), then redeploy:
```
NEXT_PUBLIC_SUPABASE_URL=<your project url>
NEXT_PUBLIC_SUPABASE_ANON_KEY=<your anon public key>
```

## 3. Google OAuth
1. Google Cloud Console → APIs & Services → Credentials → Create OAuth client ID
   (type: Web application).
2. Authorized redirect URI: `https://<project-ref>.supabase.co/auth/v1/callback`.
3. Copy the client ID + secret into Supabase → Authentication → Providers →
   Google, and enable it.

## 4. Auth redirect URLs (Supabase → Authentication → URL Configuration)
- Site URL: your production URL (e.g. `https://animood-app.vercel.app`).
- Additional redirect URLs: `http://localhost:3000/auth/callback` and
  `https://animood-app.vercel.app/auth/callback`.

## Local storage and sync behavior

- Guest lists use `animood.list.v1`; signed-in lists use a separate
  `animood.list.v1.user:<user-id>` key for each account. Signing out shows the
  guest list and retains the account's unsent changes for its next sign-in.
- Existing shared-slot lists are migrated using their legacy owner marker.
  An unowned guest list is claimed by the next account that signs in.
- Each account record includes the last acknowledged cloud snapshot and IDs
  of attempted writes. Pending edits and removals survive reloads, sign-out,
  and lost network responses. Do not clear browser storage to troubleshoot
  sync errors unless pending changes have been backed up.
- Failed syncs retry with backoff (2 seconds up to 30 seconds), on browser
  reconnection, or via **Retry** in the account indicator. “Synced · Cloud”
  means the current local changes have been acknowledged, not live updates
  from other devices. Remote changes are pulled at sign-in/page reload.
- Account changes abort old requests and invalidate their callbacks. The
  existing database ownership policies still enforce access to writes.

These changes require no additional environment variables or database migration.

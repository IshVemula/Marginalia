# Marginalia

A calm personal operating system for graduate school and early adult life. A
static site (`index.html`, no build step) with a private, owner-only login. Your
data is stored in your own Supabase project and syncs across devices.

## Structure

Five areas, each with its own model:

| Area | Question it answers |
|------|---------------------|
| **Academics** | What do I need to do for each subject, and what deadlines are coming up? |
| **Life Admin** | What annoying but important life thing am I forgetting? |
| **Career** | What should I do next professionally? |
| **People** | Who should I remember to reach out to? |
| **Personal** | What do I want to make time for? |

Plus **Today**, **Upcoming**, and a single typed **+ Add** flow.

## How access works

- Visitors see only a sign-in screen. There is no public view and no sign-up button.
- Sign-in is email + password through Supabase Auth.
- Data lives in one table, `app_state`, protected by row-level security
  (`supabase/schema.sql`): only the signed-in owner can read or write their row, and
  the anonymous role has no access at all.
- With sign-ups turned off (step 3 below), your account is the only one that can exist.

## Setup (one time)

1. **Create a project** at <https://supabase.com> (free tier is fine).
2. **Create the table.** Dashboard -> *SQL Editor* -> *New query*, paste the contents of
   `supabase/schema.sql`, and run it.
3. **Create your account, then close sign-ups.**
   - *Authentication -> Users -> Add user -> Create new user.* Enter your email and a strong
     password and tick **Auto Confirm User**.
   - *Authentication -> Sign In / Providers* (or *Settings*): turn **off** "Allow new users
     to sign up".
4. **Connect the app.** *Project Settings -> API*: copy the **Project URL** and the
   **anon public** key into `config.js`. The anon key is meant to be public. Never use the
   `service_role` key.
5. **Deploy.** Commit and push; Vercel redeploys. Open the site and sign in. On first sign-in
   the app starts with example data, or imports data from this browser's old storage if present.

## Run locally

```bash
python3 -m http.server 8000   # then open http://localhost:8000
```

## Deploy on Vercel

Static site: no framework, no build command, output directory is the repo root.
Import the repo in Vercel, set **Framework Preset: Other**, deploy. `vercel.json` adds a
few security headers.

## Notes

- Changes save automatically a moment after you make them (status shown top-right). If you
  go offline it retries; closing the tab while "Saving…" is showing may lose that last edit.
- Last write wins: editing from two devices at the same moment keeps whichever saved last.
- Fonts load from Google Fonts and the Supabase client loads from jsDelivr (pinned, with an
  integrity hash).
- No password reset flow is built in. If you forget it, reset it from the Supabase dashboard
  (*Authentication -> Users*).

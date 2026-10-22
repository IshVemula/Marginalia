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

## Editing

- Hover a row (or just look, on a phone) and click **Edit**, or click its text, to change any
  field: dates, times, status, amounts, links, notes, categories.
- Academics: add subjects from the page or **+ Add -> Academic -> New subject**; **Edit subject**
  renames, recolors, or deletes one; the semester name has its own **Edit**.
- **+ Add a deadline / milestone / bill / document / application** links sit under each list.
- **Start fresh** (bottom of the sidebar) clears the example data after a confirmation.

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

## Morning digest (email)

Every morning Marginalia emails you a short summary of your day, built from the same Supabase data the
site uses: **classes today**, **overdue**, **due today**, **the next 3 days**, and a small "on your
radar" (bills due soon, applications you're waiting on, people to follow up with). Sections with nothing in
them are left out, and on a day with nothing at all you get a short "Clear day" note. It is read-only: the
digest never changes your planner data.

### How it runs
- `api/morning-digest.js` is a serverless function. Vercel Cron calls it; so can you (see below).
- It sends between **7:00 and 11:59 AM New York time**. Vercel's cron runs on UTC, so `vercel.json` registers
  six daily crons (11:00-16:00 UTC), enough to cover 7-11 AM in both summer and winter time. The function
  checks the real New York hour and does nothing outside the window, so daylight saving never shifts it.
- **On the free (Hobby) plan each cron fires somewhere inside its hour**, so the first attempt lands between
  7:00 and 7:59 AM, not exactly at 7:00. (The Pro plan is accurate to the minute.)
- **Retries and no double sends.** The later crons are automatic retries. A run first claims today's row in
  the small `digest_log` table, and Resend is sent an idempotency key for the day, so:
  - once today's email is sent, every later run does nothing;
  - if a send fails (or a run dies), the next run in the window tries again;
  - two runs at the same moment (Vercel can occasionally deliver a cron twice) send one email.
- If nothing could be sent by 11:59 AM, the day is recorded as missed in `digest_log` and no late email goes out.

### Setup (one time)
1. **Create the log table.** Supabase -> SQL Editor -> paste `supabase/003_digest_log.sql` -> Run.
2. **Resend.** Create a free account at resend.com and an API key. The digest is sent from
   `onboarding@resend.dev`, which Resend only lets deliver to **your own Resend account email**, so use that
   address as `DIGEST_TO_EMAIL`.
3. **Add the environment variables** in Vercel (Project -> Settings -> Environment Variables, Production):

   | Variable | Required | What it is |
   |---|---|---|
   | `CRON_SECRET` | yes | A random string of 16+ characters. Vercel sends it as `Authorization: Bearer ...` on every cron call; the endpoint refuses (401) anything else. |
   | `SUPABASE_URL` | yes | Your project URL (the same one in `config.js`). |
   | `SUPABASE_SERVICE_ROLE_KEY` | yes | Supabase -> Project Settings -> API -> **service_role** key. **Server-side only**: it bypasses row-level security, so keep it here, mark it Sensitive, and never put it in `config.js`, the repo, or the browser. |
   | `RESEND_API_KEY` | yes | Your Resend API key. |
   | `DIGEST_TO_EMAIL` | yes | Where to send it (your Resend account email). |
   | `DIGEST_USER_ID` | no | Only needed if the table ever holds more than one record; the digest refuses to guess. |
   | `DIGEST_SEND_HOUR` / `DIGEST_LATEST_HOUR` | no | The New York window, default `7` and `11`. |
   | `DIGEST_SITE_URL` | no | Adds an "Open Marginalia" link. Defaults to your production URL. |

4. **Deploy** (push to `main`). Vercel registers the crons when the production deployment goes live.

### Preview and trigger it by hand
Both need the secret. Run these from a terminal, with your site's address and secret filled in.

Preview today's email without sending anything (works at any hour):

```bash
curl -H "Authorization: Bearer $CRON_SECRET" "https://YOUR-SITE.vercel.app/api/morning-digest?dryRun=1&format=text"
```

Use `format=html` to get the email as a page you can save and open, or leave `format` off for JSON.

Send it right now, ignoring the 7-11 AM window (it still can't send twice in a day):

```bash
curl -H "Authorization: Bearer $CRON_SECRET" "https://YOUR-SITE.vercel.app/api/morning-digest?force=1"
```

You can also run a cron job on demand from the Vercel dashboard (Settings -> Cron Jobs) or the Vercel CLI
(`vercel crons`).

**If your site uses Vercel Deployment Protection** (the Vercel login screen in front of the site), check that cron
calls get through: use the run-on-demand option once after deploying and look at the function logs. If it is
blocked, add a Protection Bypass for Automation.

### Seeing what happened
Each day gets one row in `digest_log` (status `sent`, `failed` with the reason, or `failed` marked missed).
A day with no row means Vercel never called the function. In Supabase -> SQL Editor:

```sql
select sent_on, status, attempts, detail from public.digest_log order by sent_on desc limit 14;
```

### Change the send time
The window is in New York hours. For example, 8 AM to 12:59 PM:

```bash
node scripts/cron-entries.js 8 12
```

Paste the printed `crons` block over the one in `vercel.json`, set `DIGEST_SEND_HOUR=8` and
`DIGEST_LATEST_HOUR=12` in Vercel, and redeploy. (A test fails if `vercel.json` and the code disagree.)

### Tests
```bash
npm test
```

They cover the digest sections, empty and older-shaped records, the time zone on both sides of each daylight
saving change (Mar 8 and Nov 1, 2026), the once-a-day guard, retries, the send window, and the secret.

### For later: a ranked plan
The code is split so a ranked plan (a capped 3-5 item list scored by due date, size, and how long something has
sat untouched, with a slot kept for Career and People) can replace the simple sections without touching the rest:
`lib/digest/collect.js` reads the data, `lib/digest/phase1.js` chooses what appears, `lib/digest/render.js` draws
the email, and `lib/digest/index.js` is where another planner is registered.

## Notes

- Changes save automatically a moment after you make them (status shown top-right). If you
  go offline it retries; closing the tab while "Saving…" is showing may lose that last edit.
- Last write wins: editing from two devices at the same moment keeps whichever saved last.
- Fonts load from Google Fonts and the Supabase client loads from jsDelivr (pinned, with an
  integrity hash).
- No password reset flow is built in. If you forget it, reset it from the Supabase dashboard
  (*Authentication -> Users*).

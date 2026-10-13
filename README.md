# Marginalia

A calm personal operating system for graduate school and early adult life. One
self-contained `index.html` — no build step, no backend. All data is stored in
the visitor's browser via `localStorage`.

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

## Run locally

```bash
python3 -m http.server 8000   # then open http://localhost:8000
```

## Deploy on Vercel

It's a static site: no framework, no build command, output directory is the
repo root. `vercel.json` sets clean URLs and a few security headers.

**CLI**

```bash
npm i -g vercel
vercel login
vercel          # preview deploy
vercel --prod   # production deploy
```

**Git integration** — push to GitHub, then in Vercel choose **Add New → Project**,
import the repo, set **Framework Preset: Other**, leave the build command empty,
and deploy. Every push to `main` redeploys.

## Notes

- Data is per-browser and per-origin; it does not sync across devices.
- Fonts load from Google Fonts; everything else is inline in `index.html`.
- First load seeds example data. Clear it and add your own.

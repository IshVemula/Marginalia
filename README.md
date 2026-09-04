# Marginalia

A calm personal operating system for graduate school and early adult life. One
self-contained HTML file — no build step, no backend. All data is stored in the
visitor's browser via `localStorage`.

## Structure

The app is organized around five areas of a grad student's life, each with its
own structure and interaction model:

| Area | Question it answers |
|------|---------------------|
| **Academics** | What do I need to do for each subject, and what deadlines are coming up? |
| **Life Admin** | What annoying but important life thing am I forgetting? |
| **Career** | What should I do next professionally? |
| **People** | Who should I remember to reach out to? |
| **Personal** | What do I want to make time for? |

Plus a **Today** page (due-today and overdue, grouped by area) and an
**Upcoming** page (one cross-category timeline). A single typed **+ Add** button
asks what you're adding, then shows only the fields for that type.

## Run locally

It's a static file. Any of these work:

```bash
# Python
python3 -m http.server 8000
# then open http://localhost:8000

# Or just open the file directly
open index.html
```

## Deploy

Any static host serves it as-is. The entry point is `index.html` at the repo root.

### GitHub Pages (included workflow)

Push to GitHub, then in **Settings → Pages** set **Source: GitHub Actions**.
`.github/workflows/deploy-pages.yml` publishes the repo root on every push to
`main`.

### Netlify

- Drag the folder onto <https://app.netlify.com/drop>, or
- Connect the repo — no build command, publish directory `.`

### Vercel / Cloudflare Pages

Import the repo. Framework preset: **Other**. No build command. Output
directory: repo root.

## Notes

- Data is per-browser and per-origin. It does not sync across devices or users.
- Fonts load from Google Fonts; everything else is inline in `index.html`.
- First load seeds example data (Fall 2026 subjects, sample bills, follow-ups).
  Clear it and add your own.

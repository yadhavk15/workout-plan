# Workout Sheet

A tiny, mobile-first workout reference. It reads your plan and form notes from
Markdown files in this repo and lets you jot a free-text "best" for each
exercise. No frameworks, no build step, no backend — just static files.

## Files

- `index.html` — page shell, loads Marked.js (CDN) for note rendering.
- `styles.css` — mobile-first styling.
- `app.js` — Markdown parsing, rendering, and localStorage.
- `workout-plan.md` — workout structure & prescriptions.
- `exercise-notes.md` — detailed per-exercise form notes.

## Run locally

The app uses `fetch()` to read the Markdown files, so it must be served over
HTTP — opening `index.html` with `file://` will not work.

```bash
python3 -m http.server 8000
```

Then open <http://localhost:8000>.

## Deploy to GitHub Pages

1. Push this repo to GitHub.
2. Settings → Pages → deploy from the `main` branch, root (`/`).
3. Open the published URL. All paths are relative, so it works under a
   `username.github.io/repo/` subpath.

## How it works

- Pick a day from the buttons at the top. Your choice is remembered
  (`localStorage`) and restored on reload.
- Each exercise shows its prescription, a free-text **Best** field, and a
  collapsible **Notes** section.
- Best values autosave on change/blur — no save button. They are keyed by a
  stable exercise ID, so renaming an exercise's display name keeps your data.

## Markdown schema

Exercise IDs come from the heading text and link the plan, the notes, and your
saved best values. Keep IDs stable even if display names change.

`workout-plan.md`:

```md
# Workout Plan
## day-1
name: Day 1
### upper-body
name: Upper Body
#### chest-supported-row
name: Chest-Supported Row
prescription: 3x8-12
```

`exercise-notes.md`:

```md
## chest-supported-row
name: Chest-Supported Row
type: Back
### Setup
- ...
```

Open the browser console: the app warns about plan exercises missing notes and
notes that aren't used by any day.

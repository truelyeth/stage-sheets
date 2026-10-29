# Stage Sheets

Chord sheets for the stage. One static page, no backend.

- `index.html` — the app
- `songs.json` — your setlist, in order. Each song: `id`, `title`, `key`, `speed` (px/s), `tr` (transpose), `body` (chords above lyrics)

## Deploy to Vercel

    npm i -g vercel
    vercel

Accept the defaults (it is a static site, no build). Then on the tablet open the URL in Chrome
and use "Add to Home screen".

## Change songs

From the page itself: open Sync, paste a GitHub fine-grained token (this repo only, Contents:
read and write). From then on every add, edit, delete, reorder, speed or transpose change is
committed to `songs.json` here, and Vercel redeploys. Devices without a token read the setlist
and keep their own tweaks locally.

You can also edit `songs.json` by hand and push.

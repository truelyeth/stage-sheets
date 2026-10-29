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

Edit `songs.json` and run `vercel --prod` (or push to the connected Git repo). The tablet gets the
new setlist on its next reload. Scroll speed and transpose changed on a device stay on that device.

Tip: write a song in the page's editor, press Backup, copy the text, paste it into `songs.json`.

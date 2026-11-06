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

## Import from Ultimate Guitar

Open Sync in the app: there is a "Send to Stage Sheets" bookmark. Drag it to the bookmarks bar
(laptop) or save its address as a bookmark named `send` (Chrome on the tablet). On any UG chord
page, click the bookmark: the song lands in the app with title, artist, key and capo filled in.
It runs in your own browser, so it uses your UG login and never touches a server.

## Find on UG (search by name)

The "Find on UG" button searches by name and imports the version you pick. Hebrew names go to tab4u first, then Ultimate Guitar; English the other way round. Hebrew sheets render right-to-left with chords aligned the way tab4u lays them out. It uses
the serverless function in `api/ug.js` (deployed by Vercel automatically). Ultimate Guitar may block
server-side fetches; when it does the app says so and the Send bookmark still works.

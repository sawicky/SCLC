# Deploying SCLC

SCLC is a **pure static site**: HTML, CSS, JS, and a JSON catalog. No database, no server-side code, no auth. All per-user state (roster, points, wishlists, win history) lives in each visitor's browser `localStorage`.

That means you can host it on basically any static host. The folder that needs to be served is `public/`.

## Recommended: Supabase Storage (free tier)

You don't need Postgres, RLS, or anything else from Supabase — the free Storage product alone is enough.

1. In your Supabase project, go to **Storage → Create a new bucket**.
   - Name: `sclc` (or whatever you like)
   - Set the bucket to **Public**.
2. Upload the **contents** of `public/` to the bucket root. The structure inside the bucket should look like:
   ```
   index.html
   styles.css
   app.js
   data/items.json
   ```
   You can upload via the Supabase dashboard (drag-drop) or with the Supabase CLI:
   ```bash
   # one-time
   npm i -g supabase
   supabase login

   # upload (run from the sc-loot directory)
   supabase storage cp -r public/ ss://sclc/
   ```
3. Open the bucket, click `index.html` → **Get public URL**. That URL is your site.

   The URL will look like:
   ```
   https://<project-ref>.supabase.co/storage/v1/object/public/sclc/index.html
   ```

That's it. Refresh the page after editing `data/items.json` and re-uploading it — the app cache-busts every fetch, so changes show up immediately.

### Updating items.json later

Just upload a new `public/data/items.json` to the same path in the bucket (overwrite the file). Visitors will pick up the new version on their next reload.

If you regenerate from a new TSV, the importer writes straight to that path:

```bash
python3 scripts/build_items_json.py path/to/new_export.tsv \
    -o public/data/items.json -v
```

Then re-upload `public/data/items.json` to the bucket.

## Easier alternatives

Supabase Storage works but the public URL is a bit awkward. If you don't care which host, any of these are a single command:

- **Vercel** — `npm i -g vercel`, then `vercel deploy public` in the project directory.
- **Netlify** — drag the `public/` folder onto https://app.netlify.com/drop.
- **GitHub Pages** — push the `public/` folder to a `gh-pages` branch (or set Pages to serve from `/public` on `main`).
- **Cloudflare Pages** — connect your repo, set build output to `public/`.

All of those give you a cleaner URL and free SSL.

## Local development

You don't need any of this to run locally. From the project directory:

```bash
npm install   # only needed once, installs Express for the dev server
npm start     # serves public/ at http://localhost:3000
```

Or any other static server works (Python's `python3 -m http.server -d public 3000` will do).

## What's stored where

The deployed site is **read-only data** — `items.json` shipped in the bundle. The mutable per-user data lives in each browser:

| State | localStorage key |
|---|---|
| Roster | `sclo.people.v1` |
| Attendance points | `sclc.points.v1` |
| Wishlists | `sclo.wishlists.v1` |
| Per-person win history (permanent) | `sclc.winsByPerson.v1` |
| Last-clicked person | `sclo.focused.v1` |
| Global activity feed (last 200) | `sclo.activity.v1` |
| Distribution method per item | `sclo.methodByItem.v1` |
| Weights per person | `sclo.weights.v1` |
| Tree open/closed state | `sclo.openCats.v1`, `sclo.openSubs.v1` |
| Last-won timestamps (for "least recent") | `sclo.lastWonAt.v1` |

This means each loot master has their own private session. If you want shared state across multiple devices/users you'd need a backend — let me know if that ever becomes a requirement.

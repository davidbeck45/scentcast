# Scentcast

Picks fragrances from David's own Fragrantica wardrobe for the weather, time of day and occasion. Static web app: vanilla ES modules, no build step, no dependencies. The same engine runs in Node for answers in the terminal.

## Answering "what should I wear…"

1. Get live picks from the engine: `node scripts/recommend.mjs --city "<city>" [--occasion <id>] [--slot day|night] --json`. Occasion ids are in `src/occasions.js`. Ask David for his city if he hasn't given it. Bottles he switched off in the app ("Manage") are stored on his phone only; pass any he mentions as `--exclude "Name,Name"`.
2. For an occasion no preset covers (job interview, outdoor wedding, a flight), run the nearest preset(s), then adjust using `data/collection.json`: accord strengths (0–100), note pyramid, season and day/night vote shares.
3. Reply with a short ranked shortlist drawn only from `data/collection.json`: each pick with its reason (weather, votes, accords), plus a runner-up.

## Collection data

`data/collection.jsonl` is the raw scrape, one line per bottle. `data/collection.json` is generated from it by `npm run build:data`, so edit the jsonl.

To add or refresh a bottle (David is logged in to Fragrantica in Chrome as @doeszen):
1. Open the perfume page with Claude in Chrome.
2. Run `scripts/fragrantica-extract.js` on the rendered page with the javascript tool; it returns one JSON line.
3. Append or replace that line in `data/collection.jsonl`, then `npm run build:data` and `npm test`.

Bottles a first-time visitor never sees (demo-safe) are `DEFAULT_HIDDEN` in `src/hidden.js`; a device's own Manage choices override it.

The full owned list is the "Perfumes I Have" shelf at `https://www.fragrantica.com/@doeszen#wardrobe`. The profile home mixes in his Want list.

Fragrantica gotchas:
- The "When To Wear" and "Rating" cards render client-side from obfuscated embedded data. Read the rendered DOM (the extractor waits for it); raw HTML fetches lack those numbers.
- The current page layout has no longevity or sillage votes, so the data has none.
- Tool output that includes raw page HTML can trip a cookie/query-string filter; return parsed fields only.
- Bottle images hotlink `fimgs.net/mdimg/perfume-thumbs/dark-m.<id>.2x.webp` (transparent background).

## Other people's collections (Fragella)

The app ranks one of three lists: `demo` (David's wardrobe, `data/collection.json`), `mine` (bottles a visitor adds; full records stored in their localStorage) or a shared link (`?c=id,id&n=Name`, opened as a temporary view). Logic lives in `src/collections.js` and `src/main.js`.

Bottles outside the demo come from the Fragella API through the Cloudflare Worker in `worker/`, which keeps the key server-side, caches each bottle and search in KV for 30 days, and caps upstream lookups per IP per day. Fragella ids are `fg:<slug>`; demo ids are Fragrantica numbers, all compared as strings.

Fragella's free plan is 20 requests a month, so:
- Develop against `MOCK=1 node worker/dev.mjs` (port 8787), which answers from saved responses in `.cache/fragella/`. Spend real requests only on purpose, save the raw response under `.cache/fragella/`, and check usage on the Fragella dashboard.
- Keep Fragella responses out of git (`.cache/` is ignored): their terms bar storing or redistributing bulk data. Tests use synthetic records.
- `src/fragella.js` converts records to the engine shape. Its season smoothing and night-lean constants were fitted on bottles present in both sources (Sauvage, Liquid Brun, Cream Velvet, Essence de Blanc); refit if more overlaps are fetched.

The key lives in `worker/.dev.vars` (ignored) and as the Worker secret `FRAGELLA_KEY`. Deploy with `cd worker && npx wrangler deploy`; the resulting URL is `DEPLOYED` in `src/api.js`.

## Engine

`src/engine.js` is pure: fragrances + conditions in, ranked tiers with reasons out. Tiers are by rank (3 S, 5 A, 6 B, rest C). `test/engine.test.js` pins behaviour on the real collection (hot humid day puts fresh scents on top, cold night puts heavy ones on top, occasion sanity), so run `npm test` after any tuning. Accord heaviness and chip colors live in `src/accords.js`; occasion profiles in `src/occasions.js`.

Season and time fit are half "within its comfort zone" and half "its specialty" (lift over an even vote split). The specialty half keeps flat all-rounders from winning every mild day.

## Deploy

GitHub Pages serves `main` at https://davidbeck45.github.io/scentcast/, so pushing to `main` publishes. Commit data refreshes (`data/collection.json`) for the live site to see them.

## Checking the UI

`npm run dev` serves http://127.0.0.1:5173. `?loc=lat,lon,Name` pins a location and skips the location prompt, which makes headless screenshots possible. `dev/scenes.html` renders every weather and time-of-day scene for tuning `src/scene.js`. The service worker is network-first for app files, so a reload shows edits.

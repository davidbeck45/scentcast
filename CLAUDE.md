# Scentcast

Picks fragrances from David's own Fragrantica wardrobe for the weather, time of day and occasion. Static web app: vanilla ES modules, no build step, no dependencies. The same engine runs in Node for answers in the terminal.

## Answering "what should I wear…"

1. Get live picks from the engine: `node scripts/recommend.mjs --city "<city>" [--occasion <id>] [--slot day|night] --json`. For "this week" or a trip, add `--week` for a day + night plan over the next 7 days. Occasion ids are in `src/occasions.js`. Ask David for his city if he hasn't given it. Bottles he switched off in the app ("Manage") are stored on his phone only; pass any he mentions as `--exclude "Name,Name"`.
2. For an occasion no preset covers (job interview, outdoor wedding, a flight), run the nearest preset(s), then adjust using `data/collection.json`: accord strengths (0–100), note pyramid, season and day/night vote shares.
3. Reply with a short ranked shortlist drawn only from `data/collection.json`: each pick with its reason (weather, votes, accords), plus a runner-up.

For "what temperature suits X": `node scripts/recommend.mjs --ideal "<name>" [--json]` gives the feels-like range it wears best in (`comfortRange` in the engine, also on its detail sheet) and where it makes the wardrobe's top 3 by day and by night.

For layering ("what goes with X", "cool layers"): `node scripts/recommend.mjs --layer "<name>" [--json]`, or `--layer all` for the best pairs in the wardrobe. No city needed; add `--city "<city>" [--slot day|night]` to score the pairs for that window's weather.

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
- Fragrantica sometimes shows a Cloudflare "Verify you are human" check; ask David to click it.
- To find a bottle's page, open `https://www.fragrantica.com/search/?query=<name brand>` and read the `/perfume/` links once results render (the sidebar also lists David's own bottles).
- Bottle images hotlink `fimgs.net/mdimg/perfume-thumbs/dark-m.<id>.2x.webp` (transparent background).

## Catalog (other people's Fragrantica bottles)

`data/catalog.jsonl` (built to `data/catalog.json` by the same `npm run build:data`) holds Fragrantica bottles outside David's wardrobe, mostly indie ones Fragella lacks, added for friends and family. The app searches the demo and the catalog before Fragella (free, real votes), and share links resolve catalog ids like demo ids. Bottles here never show up in the demo.

When someone sends their Fragrantica profile (they follow the guide at https://claude.ai/code/artifact/25b353d3-857f-4341-89b3-230131f8c484):
1. Open `https://www.fragrantica.com/@<name>#wardrobe` with Claude in Chrome and run `scripts/fragrantica-wardrobe.js`. It lists the pages on their "Perfumes I Have" shelf; `found` below `expected` means the shelf didn't fully load.
2. Skip pages whose id (the number ending the slug) is already in `data/collection.jsonl` or `data/catalog.jsonl`. Run the extractor on each remaining page and append its line to `data/catalog.jsonl`.
3. Add any accord the extractor returns that `src/accords.js` lacks (weight and color); the engine ignores unknown accords. Then `npm run build:data` and `npm test`.
4. Once pushed, send them `https://davidbeck45.github.io/scentcast/?c=<id>,<id>&n=<Name>` with their bottles' ids; they open it and tap "Save as mine".

## Other people's collections (Fragella and hand-entered)

The app ranks one of three lists: `demo` (David's wardrobe, `data/collection.json`), `mine` (bottles a visitor adds; full records stored in their localStorage) or a shared link (`?c=id,id&n=Name`, opened as a temporary view). Logic lives in `src/collections.js` and `src/main.js`.

Bottles no source has are entered by hand ("Add it yourself", `src/custom.js`): up to 6 accords, strongest first, plus optional seasons and day/night. Season and night shares blend those picks with a linear fit on accord heaviness over the votes in `data/`; `npm run fit` refits `SEASON_FIT` and `NIGHT_FIT` along with the accord weights. Their ids are `my:<random>`, and share links carry them whole as `my:<id>~<base64url>`. Pasted lists only tick a Fragella hit whose name words were all typed (`nameMatches`); the rest come unticked with an "Add it yourself" option.

Bottles outside the demo come from the Fragella API through the Cloudflare Worker in `worker/`, which keeps the key server-side, caches each bottle and search in KV for 30 days, and caps upstream lookups per IP per day. Fragella ids are `fg:<slug>`; demo ids are Fragrantica numbers, all compared as strings.

Fragella's free plan is 20 requests a month, so:
- Develop against `MOCK=1 node worker/dev.mjs` (port 8787), which answers from saved responses in `.cache/fragella/`. Spend real requests only on purpose, save the raw response under `.cache/fragella/`, and check usage on the Fragella dashboard.
- Keep Fragella responses out of git (`.cache/` is ignored): their terms bar storing or redistributing bulk data. Tests use synthetic records.
- `src/fragella.js` converts records to the engine shape. Its season smoothing and night-lean constants were fitted on bottles present in both sources (Sauvage, Liquid Brun, Cream Velvet, Essence de Blanc); refit if more overlaps are fetched.

The key lives in `worker/.dev.vars` (ignored) and as the Worker secret `FRAGELLA_KEY`. Deploy with `cd worker && npx wrangler deploy` (Cloudflare account davidbeck45, KV namespace `CACHE`); it serves https://scentcast-api.davidbeck45.workers.dev, which is `DEPLOYED` in `src/api.js`.

## Engine

`src/engine.js` is pure: fragrances + conditions in, ranked tiers with reasons out. Tiers are by rank (3 S, 5 A, 6 B, rest C). `test/engine.test.js` pins behaviour on the real collection (hot humid day puts fresh scents on top, cold night puts heavy ones on top, occasion sanity), so run `npm test` after any tuning. Accord heaviness and chip colors live in `src/accords.js`: each accord has a hand-set `prior` and a `weight` that `npm run fit` (`scripts/fit-accords.mjs`) pulls toward the season votes of every bottle in `data/`. Rerun it after adding bottles, then `npm test`. A new accord gets `weight` equal to its `prior`. Occasion profiles live in `src/occasions.js`.

Season and time fit are half "within its comfort zone" and half "its specialty" (lift over an even vote split). The specialty half keeps flat all-rounders from winning every mild day.

Layering (`src/layering.js`, the "Layer it with" section of a bottle's detail sheet) is separate from ranking. Notes map to accord families by name (`NOTE_FAMILIES`, first match wins, so specific names go first), and each bottle's profile blends those with its accords. A pair scores on complement (`PAIRS`, symmetric, negatives for clashes), a bridge of shared families or notes (near-duplicates are marked down), and heaviness contrast; the heavier bottle is sprayed first. Each partner's average pairing across the collection is subtracted, so all-rounders don't top every list. Given a weather window (the sheet always has one), `blendFit` reads the pair like the engine reads one bottle (both bottles' season votes, and their average heaviness against the weather's target) and a pair below `BLEND_OK` loses points; without one, two heavy bottles take a flat penalty instead. `test/layering.test.js` fails when a note in the data maps to no family (add it to `NOTE_FAMILIES`), or when `PAIRS` has no rule for more than a fifth of how the data's families meet (add rules for the gaps it names; a 0 marks a pair as considered and neutral). Rescale `COMPLEMENT_FLOOR` and `COMPLEMENT_SPAN` to the complement's 10th–90th percentile after big table changes.

`planWindows` plans several windows in time order (Today's day + night, the Week tab, `--week`): each pick counts as a `planned` wear for later windows, and a bottle not yet in the plan takes the slot when it scores within `PLAN_MARGIN` of the top. A wear already logged for a window stays its pick.

## Deploy

GitHub Pages serves `main` at https://davidbeck45.github.io/scentcast/, so pushing to `main` publishes. Commit data refreshes (`data/collection.json`) for the live site to see them.

## Checking the UI

`npm run dev` serves http://127.0.0.1:5173. `?loc=lat,lon,Name` pins a location and skips the location prompt, which makes headless screenshots possible; `?view=today|week|occasion` opens a tab. `dev/scenes.html` renders every weather and time-of-day scene for tuning `src/scene.js`. `dev/og.html` is the link-preview card; re-render `icons/og.png` from it with the command in its comment. The service worker is network-first for app files, so a reload shows edits; bump `CACHE` in `sw.js` when adding app files.

Temperatures are °F throughout the engine and weather code; only `src/ui.js` converts for display (`setUnits`). Engine reason text must not include a temperature number for that reason.

## Omarchy widget

The repo root doubles as an Omarchy shell plugin (`doeszen.scentcast`): `manifest.json` points at `omarchy/BarWidget.qml`, which loads `omarchy/Panel.qml`. The panel runs `node omarchy/widget.mjs`, which resolves a place (widget setting, else `~/.local/state/omarchy/settings/weather.json`, else wttr.in's IP lookup), fetches the forecast and prints the week plan as JSON (`widgetPayload`, tested in `test/widget.test.js`). Without `--hidden` it drops `DEFAULT_HIDDEN`, like a new device.

The installed copy in `~/.config/omarchy/plugins/doeszen.scentcast/` is separate from this checkout (the plugin validator refuses symlinks). To try edits, copy the files there (`git ls-files -co --exclude-standard`, which keeps `worker/.dev.vars` out); the shell hot-reloads it. `omarchy-shell doeszen.scentcast open|close|refresh` drives the popup, `omarchy plugin validate .` checks the manifest, and QML errors land in `/run/user/$UID/quickshell/by-pid/<shell pid>/log.log`. Built-in widgets to crib from live in `/usr/share/omarchy/shell/plugins/` (read only).

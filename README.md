# Scentcast

A quick look at what to wear from my own collection, based on today's weather, time of day and occasion.

- **Today** — live local weather (Open-Meteo, no key), a scene drawn for the conditions, and S/A/B/C tiers for daytime and tonight. Each pick shows a match score and, in its detail sheet, why it ranks where it does and what else fits.
- **Week** — a day and night pick for each of the next 7 days, planned against the forecast so nothing repeats back to back.
- **Occasion** — Everyday, Office, Date Night, Night Out, Formal, Outdoors, Cozy, for daytime or tonight.
- **Wear this** — logs what you wore so picks rotate over the next couple of days. The wear journal shows a calendar, your most-worn bottles and the ones gathering dust.
- °F or °C (defaults from your locale), recent locations, and home-screen shortcuts for Today, Week and Occasion.
- **Your own collection** — search 80k+ fragrances (via [Fragella](https://api.fragella.com)) or paste a list, then share it as a link. The demo shows my wardrobe.

Picks come from Fragrantica community votes (season, day/night), each bottle's main accords, how heavy they wear versus the temperature and humidity, and the occasion's accord profile.

## Run

```sh
npm run dev      # http://127.0.0.1:5173
npm test
MOCK=1 node worker/dev.mjs   # local API on :8787 from saved responses
node scripts/recommend.mjs --city "New York" --occasion date
node scripts/recommend.mjs --city "New York" --week
```

Live at **https://davidbeck45.github.io/scentcast/** (GitHub Pages from `main`; every push redeploys). Add it to your phone's home screen to use it like an app.

## Collection

`data/collection.jsonl` holds my Fragrantica wardrobe ("Have" shelf), scraped with `scripts/fragrantica-extract.js`. `npm run build:data` turns it into `data/collection.json`.

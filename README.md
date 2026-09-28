# Scentcast

A quick look at what to wear from my own collection, based on today's weather, time of day and occasion.

- **Today** — live local weather (Open-Meteo, no key), a scene drawn for the conditions, and S/A/B/C tiers for daytime and tonight.
- **Occasion** — Everyday, Office, Date Night, Night Out, Formal, Outdoors, Cozy, for daytime or tonight.
- **Wear this** — logs what you wore so picks rotate over the next couple of days.

Picks come from Fragrantica community votes (season, day/night), each bottle's main accords, how heavy they wear versus the temperature and humidity, and the occasion's accord profile.

## Run

```sh
npm run dev      # http://127.0.0.1:5173
npm test
node scripts/recommend.mjs --city "New York" --occasion date
```

It's a static site (installable as a PWA), so any static host works.

## Collection

`data/collection.jsonl` holds my Fragrantica wardrobe ("Have" shelf), scraped with `scripts/fragrantica-extract.js`. `npm run build:data` turns it into `data/collection.json`.

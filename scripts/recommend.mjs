#!/usr/bin/env node
// Same engine as the app, from the terminal.
//   node scripts/recommend.mjs --city "New York" [--occasion date] [--slot day|night] [--json]
//   node scripts/recommend.mjs --loc 40.71,-74.01
import { readFileSync } from 'node:fs';
import { parseArgs } from 'node:util';
import { rank } from '../src/engine.js';
import { OCCASIONS, occasionById } from '../src/occasions.js';
import { fetchForecast, summarize } from '../src/weather.js';
import { searchCities } from '../src/location.js';

const { values: args } = parseArgs({
  options: {
    city: { type: 'string' },
    loc: { type: 'string' },
    occasion: { type: 'string' },
    slot: { type: 'string' },
    json: { type: 'boolean', default: false },
  },
});

if (!args.city && !args.loc) {
  console.error(`usage: node scripts/recommend.mjs (--city NAME | --loc LAT,LON) [--occasion ${OCCASIONS.map(o => o.id).join('|')}] [--slot day|night] [--json]`);
  process.exit(1);
}

let place;
if (args.loc) {
  const [lat, lon] = args.loc.split(',').map(Number);
  place = { name: args.loc, lat, lon };
} else {
  const [hit] = await searchCities(args.city);
  if (!hit) { console.error(`No city found for "${args.city}"`); process.exit(1); }
  place = { name: `${hit.name}, ${hit.region}`, lat: hit.lat, lon: hit.lon };
}

const occasion = args.occasion ? occasionById(args.occasion) : null;
if (args.occasion && !occasion) { console.error(`Unknown occasion "${args.occasion}"`); process.exit(1); }

const { fragrances } = JSON.parse(readFileSync(new URL('../data/collection.json', import.meta.url)));
const wx = summarize(await fetchForecast(place));
const slots = args.slot ? [args.slot] : occasion ? [occasion.slot] : ['day', 'night'];

const result = slots.map(slot => {
  const win = wx[slot];
  const ranked = rank(fragrances, win, slot, { occasion });
  return { slot, win, ranked };
});

if (args.json) {
  console.log(JSON.stringify({
    place,
    now: wx.now,
    occasion: occasion?.id ?? null,
    slots: result.map(({ slot, win, ranked }) => ({
      slot,
      window: { label: win.label, feelsF: Math.round(win.feelsF), humidity: Math.round(win.humidity), condition: win.condition, rainChance: win.pop },
      ranked: ranked.map(r => ({ tier: r.tier, name: r.fragrance.name, brand: r.fragrance.brand, score: +r.score.toFixed(3), reasons: r.reasons.map(x => `${x.tone === 'good' ? '+' : '-'} ${x.text}`) })),
    })),
  }, null, 2));
} else {
  console.log(`${place.name} · now ${Math.round(wx.now.tempF)}°F ${wx.now.label}${occasion ? ` · occasion: ${occasion.label}` : ''}`);
  for (const { win, ranked } of result) {
    console.log(`\n${win.label}: ${win.condition}, feels ${Math.round(win.feelsF)}°F, ${Math.round(win.humidity)}% humidity${win.pop >= 30 ? `, ${win.pop}% rain` : ''}`);
    for (const tier of ['S', 'A', 'B', 'C']) {
      const rows = ranked.filter(r => r.tier === tier);
      console.log(`  ${tier}  ${rows.map(r => r.fragrance.name).join(', ')}`);
    }
    const top = ranked[0];
    console.log(`  → ${top.fragrance.name} (${top.fragrance.brand}): ${top.reasons.filter(r => r.tone === 'good').map(r => r.text).join('; ')}`);
  }
}

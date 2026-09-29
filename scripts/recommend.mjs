#!/usr/bin/env node
// Same engine as the app, from the terminal.
//   node scripts/recommend.mjs --city "New York" [--occasion date] [--slot day|night] [--json]
//   node scripts/recommend.mjs --loc 40.71,-74.01 --exclude "Sauvage,Jake"
//   node scripts/recommend.mjs --city "New York" --week   (day + night plan for the next 7 days)
// Bottles hidden in the app live in the phone's storage; pass them via --exclude.
import { readFileSync } from 'node:fs';
import { parseArgs } from 'node:util';
import { rank, planWindows } from '../src/engine.js';
import { OCCASIONS, occasionById } from '../src/occasions.js';
import { fetchForecast, summarize, week } from '../src/weather.js';
import { searchCities } from '../src/location.js';

const { values: args } = parseArgs({
  options: {
    city: { type: 'string' },
    loc: { type: 'string' },
    occasion: { type: 'string' },
    slot: { type: 'string' },
    exclude: { type: 'string', default: '' },
    json: { type: 'boolean', default: false },
    week: { type: 'boolean', default: false },
  },
});

if (!args.city && !args.loc) {
  console.error(`usage: node scripts/recommend.mjs (--city NAME | --loc LAT,LON) [--occasion ${OCCASIONS.map(o => o.id).join('|')}] [--slot day|night] [--week] [--exclude NAME,NAME] [--json]`);
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

const excluded = args.exclude.split(',').map(s => s.trim().toLowerCase()).filter(Boolean);
const fragrances = JSON.parse(readFileSync(new URL('../data/collection.json', import.meta.url))).fragrances
  .filter(f => !excluded.includes(f.name.toLowerCase()));
const forecast = await fetchForecast(place);

if (args.week) {
  const days = week(forecast);
  const plan = planWindows(fragrances, days.flatMap(d => [d.day, d.night].filter(Boolean)), { occasion });
  const pickFor = win => win && plan.find(p => p.win === win);
  const rows = days.map(d => ({ day: d, slots: [d.day, d.night].map(pickFor).filter(Boolean) }));
  if (args.json) {
    console.log(JSON.stringify({
      place,
      occasion: occasion?.id ?? null,
      days: rows.map(({ day, slots }) => ({
        date: day.dateISO,
        name: day.name,
        hiF: Math.round(day.hiF),
        loF: Math.round(day.loF),
        condition: day.condition,
        rainChance: day.pop,
        picks: slots.map(({ win, pick, ranked }) => ({
          slot: win.slot,
          feelsF: Math.round(win.feelsF),
          tier: pick.tier,
          name: pick.fragrance.name,
          brand: pick.fragrance.brand,
          reasons: pick.reasons.map(x => `${x.tone === 'good' ? '+' : '-'} ${x.text}`),
          runnerUp: ranked.find(r => r !== pick)?.fragrance.name ?? null,
        })),
      })),
    }, null, 2));
  } else {
    console.log(`${place.name} · the week ahead${occasion ? ` · occasion: ${occasion.label}` : ''}`);
    for (const { day, slots } of rows) {
      console.log(`\n${day.name} ${day.dateISO}: ${day.condition}, ${Math.round(day.hiF)}°/${Math.round(day.loF)}°F${day.pop >= 30 ? `, ${day.pop}% rain` : ''}`);
      for (const { win, pick } of slots) console.log(`  ${win.slot === 'day' ? 'day  ' : 'night'}  ${pick.tier}  ${pick.fragrance.name} (${pick.fragrance.brand})`);
    }
  }
  process.exit(0);
}

const wx = summarize(forecast);
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

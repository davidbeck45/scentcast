#!/usr/bin/env node
// Fit the engine's season climate (SEASON_CLIMATE in src/engine.js) from real
// weather: the feels-like temperature of every day window (10:00–17:00) and
// night window (19:00–23:00) over three years in temperate cities, grouped by
// meteorological season, as mean and spread.
//   node scripts/fit-seasons.mjs           (report)
//   node scripts/fit-seasons.mjs --write   (update src/engine.js)
//
// The cities are temperate on purpose: "a summer scent" is the vocabulary of
// four-season climates, and folding in Dubai or Houston, where fall runs past
// 80°F, would blur what voters mean by it.
// Weather data by Open-Meteo.com (CC BY 4.0), cached in .cache/climate/.
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { parseArgs } from 'node:util';
import { WINDOWS } from '../src/weather.js';
import { SEASONS, calendarSeason } from '../src/engine.js';

const { values: args } = parseArgs({ options: { write: { type: 'boolean', default: false } } });

const CITIES = [
  ['New York', 40.71, -74.01], ['Chicago', 41.88, -87.63], ['Toronto', 43.65, -79.38], ['London', 51.51, -0.13],
  ['Paris', 48.86, 2.35], ['Berlin', 52.52, 13.40], ['Warsaw', 52.23, 21.01], ['Madrid', 40.42, -3.70],
  ['Rome', 41.90, 12.50], ['Istanbul', 41.01, 28.98],
];
const YEARS = ['2023-01-01', '2025-12-31'];
const CACHE = new URL('../.cache/climate/', import.meta.url);

async function hourly([name, lat, lon]) {
  const file = new URL(`${name.replace(/\W/g, '')}-${YEARS.join('_')}.json`, CACHE);
  if (!existsSync(file)) {
    const params = new URLSearchParams({
      latitude: lat, longitude: lon, start_date: YEARS[0], end_date: YEARS[1],
      hourly: 'apparent_temperature', temperature_unit: 'fahrenheit', timezone: 'auto',
    });
    const res = await fetch(`https://archive-api.open-meteo.com/v1/archive?${params}`);
    if (!res.ok) throw new Error(`${name}: archive request failed (${res.status})`);
    mkdirSync(CACHE, { recursive: true });
    writeFileSync(file, await res.text());
  }
  return JSON.parse(readFileSync(file, 'utf8'));
}

// One feels-like average per window, tagged with its season.
function windows(data, lat) {
  const byWindow = new Map();
  data.hourly.time.forEach((t, i) => {
    const f = data.hourly.apparent_temperature[i];
    if (f === null) return;
    const hour = +t.slice(11, 13);
    for (const [slot, [start, end]] of Object.entries(WINDOWS)) {
      if (hour < start || hour > end) continue;
      const key = `${t.slice(0, 10)} ${slot}`;
      if (!byWindow.has(key)) byWindow.set(key, { season: calendarSeason(new Date(`${t.slice(0, 10)}T12:00:00`), lat), temps: [] });
      byWindow.get(key).temps.push(f);
    }
  });
  return [...byWindow.values()].map(w => ({ season: w.season, f: w.temps.reduce((a, b) => a + b, 0) / w.temps.length }));
}

const meanSd = xs => {
  const m = xs.reduce((a, b) => a + b, 0) / xs.length;
  return [m, Math.sqrt(xs.reduce((a, b) => a + (b - m) ** 2, 0) / xs.length)];
};

const all = [];
for (const city of CITIES) {
  const rows = windows(await hourly(city), city[1]);
  all.push(...rows);
  console.log(city[0].padEnd(10), SEASONS.map(s => {
    const [m, sd] = meanSd(rows.filter(r => r.season === s).map(r => r.f));
    return `${s} ${m.toFixed(0)}±${sd.toFixed(0)}`;
  }).join('  '));
}

const climate = Object.fromEntries(SEASONS.map(s => {
  const [m, sd] = meanSd(all.filter(r => r.season === s).map(r => r.f));
  return [s, [Math.round(m), Math.round(sd * 2) / 2]];
}));
const line = `const SEASON_CLIMATE = { ${SEASONS.map(s => `${s}: [${climate[s].join(', ')}]`).join(', ')} };`;
console.log(`\n${all.length} windows\nsrc/engine.js:\n  ${line}`);

if (args.write) {
  const path = new URL('../src/engine.js', import.meta.url);
  writeFileSync(path, readFileSync(path, 'utf8').replace(/^const SEASON_CLIMATE = .*$/m, line));
  console.log('\nwrote src/engine.js');
}

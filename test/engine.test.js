import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { rank, groupTiers, targetSeasonWeights, calendarSeason, rotationPenalty } from '../src/engine.js';
import { occasionById } from '../src/occasions.js';
import { summarize } from '../src/weather.js';

const { fragrances } = JSON.parse(readFileSync(new URL('../data/collection.json', import.meta.url)));
const names = list => list.map(r => r.fragrance.name);

const AUG = new Date('2026-08-05T12:00:00');
const SEP = new Date('2026-09-28T12:00:00');
const JAN = new Date('2027-01-15T12:00:00');
const hotHumidDay = { feelsF: 92, humidity: 75, category: 'clear', date: AUG, lat: 40 };
const coldNight = { feelsF: 28, humidity: 60, category: 'clear', date: JAN, lat: 40 };
const mildFallNight = { feelsF: 58, humidity: 60, category: 'clear', date: SEP, lat: 40 };

const HEAVY = ['Liquid Brun', 'Amber Empire', 'CH Men Prive', 'Hawas Elixir', 'Rifaaqat', 'Terra'];
const FRESH = ['Shiyaaka Sky', 'Essence de Blanc', 'Jake', 'Atlantis Extrait', 'Aristo'];

test('season weights follow temperature', () => {
  const hot = targetSeasonWeights(95, AUG, 40);
  const cold = targetSeasonWeights(20, JAN, 40);
  assert.ok(hot.summer > 0.8);
  assert.ok(cold.winter > 0.8);
});

test('calendar breaks the spring/fall tie and flips south of the equator', () => {
  const w = targetSeasonWeights(62, SEP, 40);
  assert.ok(w.fall > w.spring);
  assert.equal(calendarSeason(SEP, -33), 'spring');
});

test('hot humid day: fresh scents on top, heavy ones at the bottom', () => {
  const tiers = groupTiers(rank(fragrances, hotHumidDay, 'day'));
  for (const n of names(tiers.S)) assert.ok(FRESH.includes(n), `${n} should not be S on a hot day`);
  for (const n of HEAVY) assert.ok(names(tiers.C).includes(n), `${n} should be C on a hot day`);
});

test('cold night: heavy scents on top, fresh ones at the bottom', () => {
  const tiers = groupTiers(rank(fragrances, coldNight, 'night'));
  const top = [...names(tiers.S), ...names(tiers.A)];
  for (const n of HEAVY) assert.ok(top.includes(n), `${n} should be S/A on a cold night`);
  for (const n of FRESH) assert.ok(names(tiers.C).includes(n), `${n} should be C on a cold night`);
});

test('tiers are 3 / 5 / 6 / rest', () => {
  const tiers = groupTiers(rank(fragrances, mildFallNight, 'night'));
  assert.deepEqual([tiers.S.length, tiers.A.length, tiers.B.length, tiers.C.length], [3, 5, 6, fragrances.length - 14]);
});

test('office avoids gourmands, date night prefers them', () => {
  const office = groupTiers(rank(fragrances, { ...mildFallNight, feelsF: 68 }, 'day', { occasion: occasionById('office') }));
  const date = groupTiers(rank(fragrances, mildFallNight, 'night', { occasion: occasionById('date') }));
  for (const n of ['Cream Velvet', 'Liquid Brun']) assert.ok(names(office.C).includes(n), `${n} should be C for office`);
  assert.ok(names(date.S).some(n => ['Amber Empire', 'Cream Velvet', 'Liquid Brun'].includes(n)));
});

test('formal favors iris and powder', () => {
  const formal = groupTiers(rank(fragrances, mildFallNight, 'night', { occasion: occasionById('formal') }));
  assert.ok(names(formal.S).includes('Meant To Be Seen'));
});

test('wearing something yesterday pushes it down today', () => {
  const base = rank(fragrances, mildFallNight, 'night');
  const top = base[0].fragrance;
  const history = [{ id: top.id, date: '2026-09-27', slot: 'night' }];
  const after = rank(fragrances, mildFallNight, 'night', { history, todayISO: '2026-09-28' });
  const moved = after.find(r => r.fragrance.id === top.id);
  assert.ok(moved.score < base[0].score);
  assert.ok(moved.reasons.some(r => r.text === 'Worn yesterday'));
});

test('the pick you log for a slot is not penalized in that slot', () => {
  const history = [{ id: 1, date: '2026-09-28', slot: 'day' }];
  assert.equal(rotationPenalty(1, history, '2026-09-28', 'day').penalty, 0);
  assert.equal(rotationPenalty(1, history, '2026-09-28', 'night').penalty, 0.2);
});

test('summarize splits the forecast into day and night windows in local time', () => {
  const hours = [];
  for (const day of ['2026-09-28', '2026-09-29']) {
    for (let h = 0; h < 24; h++) hours.push(`${day}T${String(h).padStart(2, '0')}:00`);
  }
  const forecast = {
    latitude: 40,
    utc_offset_seconds: -4 * 3600,
    current: { temperature_2m: 70, apparent_temperature: 71, relative_humidity_2m: 50, weather_code: 0, cloud_cover: 5 },
    hourly: {
      time: hours,
      temperature_2m: hours.map(t => (+t.slice(11, 13) >= 19 ? 55 : 75)),
      apparent_temperature: hours.map(t => (+t.slice(11, 13) >= 19 ? 54 : 77)),
      relative_humidity_2m: hours.map(() => 50),
      weather_code: hours.map(t => (+t.slice(11, 13) >= 19 ? 61 : 1)),
      precipitation_probability: hours.map(t => (+t.slice(11, 13) >= 19 ? 70 : 5)),
    },
    daily: {
      time: ['2026-09-28', '2026-09-29'],
      sunrise: ['2026-09-28T06:50', '2026-09-29T06:51'],
      sunset: ['2026-09-28T18:45', '2026-09-29T18:43'],
      temperature_2m_max: [76, 74],
      temperature_2m_min: [54, 53],
    },
    fetchedAt: 0,
  };
  // 12:00 local (16:00 UTC)
  const wx = summarize(forecast, Date.parse('2026-09-28T16:00:00Z'));
  assert.equal(wx.todayISO, '2026-09-28');
  assert.equal(wx.day.label, 'Today');
  assert.equal(wx.day.feelsF, 77);
  assert.equal(wx.night.label, 'Tonight');
  assert.equal(wx.night.category, 'rain');
  assert.equal(wx.now.phase, 'day');

  // 20:00 local: daytime rolls to tomorrow, night is still tonight
  const evening = summarize(forecast, Date.parse('2026-09-29T00:00:00Z'));
  assert.equal(evening.day.label, 'Tomorrow');
  assert.equal(evening.day.dateISO, '2026-09-29');
  assert.equal(evening.night.label, 'Tonight');
  assert.equal(evening.now.phase, 'night');
});

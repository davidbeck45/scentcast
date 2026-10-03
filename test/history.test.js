import { test } from 'node:test';
import assert from 'node:assert/strict';
import { journalStats, journalCalendar, journalExport, toggleWear } from '../src/history.js';
import { windowOn, week } from '../src/weather.js';
import { syntheticForecast } from './fixtures.js';

const history = [
  { id: 'a', date: '2026-09-28', slot: 'day' },
  { id: 'b', date: '2026-09-27', slot: 'night' },
  { id: 'a', date: '2026-09-20', slot: 'day' },
  { id: 'c', date: '2026-07-01', slot: 'day' },
];

test('journal counts wears in the look-back window and remembers older ones', () => {
  const s = journalStats(history, '2026-09-28');
  assert.equal(s.wears, 3);
  assert.equal(s.bottles, 2);
  assert.deepEqual(s.top, [['a', 2], ['b', 1]]);
  assert.equal(s.lastWorn.get('a'), '2026-09-28');
  assert.equal(s.lastWorn.get('c'), '2026-07-01');
});

test('journal calendar runs Sunday to Saturday and ends this week', () => {
  const weeks = journalCalendar(history, '2026-09-28', 5);
  assert.equal(weeks.length, 5);
  assert.equal(weeks[0][0].dateISO, '2026-08-30'); // a Sunday
  const today = weeks[4][1];
  assert.equal(today.dateISO, '2026-09-28');
  assert.equal(today.day.id, 'a');
  assert.equal(weeks[4][0].night.id, 'b');
  assert.ok(weeks[4][2].future);
});

test('a logged wear remembers roughly where it happened', () => {
  const [entry] = toggleWear('a', '2026-10-01', 'day', { lat: 40.71283, lon: -74.00597, name: 'New York' });
  assert.deepEqual(entry, { id: 'a', date: '2026-10-01', slot: 'day', lat: 40.71, lon: -74.01 });
  assert.deepEqual(toggleWear('a', '2026-10-01', 'day')[0], { id: 'a', date: '2026-10-01', slot: 'day' });
});

test('the journal export carries the wears, place and hidden bottles', () => {
  const data = journalExport(history, { name: 'New York', lat: 40.71283, lon: -74.00597 }, new Set(['4310']), '2026-10-03T12:00:00Z');
  assert.equal(data.app, 'scentcast-journal');
  assert.deepEqual(data.location, { name: 'New York', lat: 40.71, lon: -74.01 });
  assert.deepEqual(data.hidden, ['4310']);
  assert.equal(data.history.length, history.length);
  assert.equal(journalExport([], null, new Set()).location, null);
});

test('a past window rebuilds from hourly data alone, as the archive returns it', () => {
  const forecast = syntheticForecast(3);
  delete forecast.hourly.precipitation_probability;
  const win = windowOn(forecast, '2026-09-29', 'night');
  assert.equal(win.feelsF, 55);
  assert.equal(win.slot, 'night');
  assert.equal(win.pop, 0);
  const fromWeek = week(syntheticForecast(3), Date.parse('2026-09-28T13:00:00Z')).find(d => d.dateISO === '2026-09-29').night;
  assert.equal(win.dewF, fromWeek.dewF);
});

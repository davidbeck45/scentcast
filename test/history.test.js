import { test } from 'node:test';
import assert from 'node:assert/strict';
import { journalStats, journalCalendar } from '../src/history.js';

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

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { noteFamily, layerPair, layerPicks } from '../src/layering.js';
import { DEFAULT_HIDDEN } from '../src/hidden.js';

const load = f => JSON.parse(readFileSync(new URL(`../data/${f}.json`, import.meta.url))).fragrances;
const demo = load('collection').filter(f => !DEFAULT_HIDDEN.includes(String(f.id)));
const catalog = load('catalog');

function bottle(id, accords, notes) {
  return { id, name: id, brand: 'Test', accords, notes, season: {}, dayNight: {} };
}
const GOURMAND = bottle('gourmand', { vanilla: 100, caramel: 80, sweet: 70 }, { top: ['Caramel'], base: ['Vanilla', 'Tonka Bean'] });
const GOURMAND_TWIN = bottle('twin', { vanilla: 100, sweet: 85, caramel: 75 }, { top: ['Caramel'], base: ['Vanilla', 'Tonka'] });
const WOODY = bottle('woody', { woody: 100, 'fresh spicy': 60, earthy: 45 }, { top: ['Black Pepper'], base: ['Cedar', 'Vetiver'] });
const MARINE = bottle('marine', { aquatic: 100, fresh: 80, ozonic: 60 }, { top: ['Sea Notes'], base: ['Musk'] });

test('notes map to accord families, specific names first', () => {
  assert.equal(noteFamily('Tonka Bean'), 'vanilla');
  assert.equal(noteFamily('Bourbon Vanilla'), 'vanilla');
  assert.equal(noteFamily('Orange Blossom'), 'white floral');
  assert.equal(noteFamily('Grapefruit'), 'citrus');
  assert.equal(noteFamily('Kyara Incense'), 'oud');
  assert.equal(noteFamily('Ginger Flower'), 'white floral');
  assert.equal(noteFamily('Guaiac Wood'), 'woody');
  assert.equal(noteFamily('Coconut Milk'), 'coconut');
  assert.equal(noteFamily('Hazelnut'), 'nutty');
  const unmapped = [...demo, ...catalog].flatMap(f => Object.values(f.notes).flat()).filter(n => !noteFamily(n));
  assert.deepEqual(unmapped, [], 'every note in the data has a family');
});

test('a contrasting partner beats a near-duplicate, and a clash scores lowest', () => {
  const woody = layerPair(GOURMAND, WOODY), twin = layerPair(GOURMAND, GOURMAND_TWIN), marine = layerPair(GOURMAND, MARINE);
  assert.ok(woody.score > twin.score + 0.2, `${woody.score} vs ${twin.score}`);
  assert.ok(twin.score > marine.score || marine.score < 0.2);
  assert.ok(twin.reasons.some(r => r.tone === 'bad'), 'the twin gets a warning');
  assert.ok(marine.reasons.some(r => /fight/.test(r.text)));
});

test('reasons name the notes behind the pairing, with the heavier bottle first', () => {
  const pair = layerPair(GOURMAND, WOODY);
  assert.match(pair.reasons[0].text, /^(Cedar|Vetiver|Black pepper) \w+/);
  assert.equal(pair.first, GOURMAND);
  const plural = layerPair(GOURMAND, bottle('citrus', { citrus: 100 }, { top: ['Citruses'] }));
  assert.match(plural.reasons[0].text, /^Citruses brighten /);
});

test('picks come from the rest of the collection, capped and above the bar', () => {
  const picks = layerPicks(catalog[0], catalog);
  assert.ok(picks.length > 0 && picks.length <= 3);
  assert.ok(picks.every(p => p.fragrance.id !== catalog[0].id && p.score >= 0.4));
  assert.ok(picks.every((p, i) => i === 0 || picks[i - 1].score >= p.score));
  assert.ok(picks.every(p => p.reasons.some(r => r.tone === 'good')));
});

test('no single partner takes over every list', () => {
  for (const list of [demo, catalog]) {
    const counts = {};
    for (const f of list) for (const p of layerPicks(f, list)) counts[p.fragrance.id] = (counts[p.fragrance.id] ?? 0) + 1;
    assert.ok(Math.max(...Object.values(counts)) <= 0.6 * list.length, JSON.stringify(counts));
  }
});

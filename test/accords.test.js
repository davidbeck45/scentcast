import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { ACCORDS } from '../src/accords.js';
import { fitAccordWeights, votedBottles } from '../scripts/fit-accords.mjs';

const load = f => JSON.parse(readFileSync(new URL(`../data/${f}.json`, import.meta.url))).fragrances;

test('every accord in the data has a weight and color', () => {
  const unknown = [...new Set([...load('collection'), ...load('catalog')].flatMap(f => Object.keys(f.accords)))]
    .filter(a => !ACCORDS[a]);
  assert.deepEqual(unknown, [], 'add these to src/accords.js (the engine ignores unknown accords)');
});

test('accord weights are fitted to the bottles in data/', () => {
  const fitted = fitAccordWeights(votedBottles());
  const stale = Object.entries(fitted)
    .filter(([a, w]) => Math.abs(ACCORDS[a].weight - w) > 1e-9)
    .map(([a, w]) => `${a} ${ACCORDS[a].weight} -> ${+w.toFixed(2)}`);
  assert.deepEqual(stale, [], 'the data changed since the last fit; run `npm run fit`');
});

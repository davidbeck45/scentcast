import { test } from 'node:test';
import assert from 'node:assert/strict';
import { setTheme, theme, paint, paintAccord, GRUVBOX } from '../src/theme.js';
import { ACCORDS } from '../src/accords.js';
import { renderScene, sceneTint } from '../src/scene.js';

const palette = new Set(Object.values(GRUVBOX));

test('the default theme leaves colors alone, and unknown themes fall back to it', () => {
  assert.equal(setTheme('nope'), 'default');
  assert.equal(paint('#3fa7d6'), '#3fa7d6');
});

test('gruvbox paints every accord color from its palette, keeping the gist', () => {
  setTheme('gruvbox');
  try {
    assert.equal(theme(), 'gruvbox');
    for (const [name, { color }] of Object.entries(ACCORDS)) assert.ok(palette.has(paintAccord(name, color)), `${name} -> ${paintAccord(name, color)}`);
    assert.equal(paintAccord('coffee', ACCORDS.coffee.color), GRUVBOX.orange3, 'roasted notes go rust, not olive');
    assert.ok(['#83a598', '#458588', '#076678'].includes(paint(ACCORDS.aquatic.color)), 'aquatic stays blue');
    assert.ok(['#fabd2f', '#d79921', '#b8bb26'].includes(paint(ACCORDS.citrus.color)), 'citrus stays yellow');
    assert.equal(paint(GRUVBOX.orange), GRUVBOX.orange, 'palette colors map to themselves');
  } finally {
    setTheme('default');
  }
});

test('the weather scene has its own gruvbox palette', () => {
  const colors = svg => new Set(svg.match(/#[0-9a-f]{6}/gi));
  const day = { phase: 'day', category: 'clear', season: 'fall' };
  const plain = colors(renderScene(day)), gruv = colors(renderScene({ ...day, theme: 'gruvbox' }));
  assert.ok(gruv.has('#458588') && !gruv.has('#3a8ad3'), 'gruvbox blue sky, not the default one');
  assert.ok(plain.has('#3a8ad3'));
  assert.deepEqual(sceneTint('day', 'clear', 'gruvbox'), ['#458588', '#83a598', '#bdae93']);
  assert.notDeepEqual(sceneTint('night', 'clear', 'gruvbox'), sceneTint('night', 'clear'));
});

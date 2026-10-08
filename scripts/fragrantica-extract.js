// Run on a rendered Fragrantica perfume page (e.g. via Claude in Chrome's
// javascript tool) to pull one fragrance as a JSON line for
// data/collection.jsonl. The "When To Wear" and "Rating" cards render
// client-side, so this waits for them instead of parsing raw HTML.
const sleep = ms => new Promise(r => setTimeout(r, ms));
const leaf = el => [...el.querySelectorAll('*')].filter(e => e.children.length === 0 && e.textContent.trim()).map(e => e.textContent.trim().replace(/\s+/g, ' '));
const num = s => { const m = s.match(/([\d.]+)\s*k/i); return m ? Math.round(parseFloat(m[1]) * 1000) : (parseInt(s.replace(/,/g, '')) || 0); };
const pairs = a => { const o = {}; for (let i = 0; i < a.length - 1; i += 2) o[a[i]] = num(a[i + 1]); return o; };
const card = re => [...document.querySelectorAll('.tw-rating-card-header')].find(h => re.test(h.textContent.trim()))?.parentElement;

for (let i = 0; i < 40; i++) { const c = card(/When To Wear/); if (c && /\d/.test(c.textContent)) break; await sleep(250); }

const ah = [...document.querySelectorAll('*')].find(e => e.children.length === 0 && /^main accords$/i.test(e.textContent.trim()));
let box = ah; for (let i = 0; i < 3 && box; i++) box = box.parentElement;
const acc = {};
box?.querySelectorAll('[style*="width"]').forEach(b => {
  const w = (b.getAttribute('style').match(/width:\s*([\d.]+)%/) || [])[1];
  const t = b.textContent.trim();
  if (w && t) acc[t] = Math.round(+w);
});

const pt = [...document.querySelectorAll('*')].find(e => e.children.length === 0 && /^(Perfume Pyramid|Fragrance Notes)$/i.test(e.textContent.trim()));
const pyramid = () => { let p = pt; for (let i = 0; i < 4; i++) p = p.parentElement; return leaf(p); };
const toggle = re => [...document.querySelectorAll('span')].find(e => e.children.length === 0 && re.test(e.textContent.trim()));

// "Show votes" adds how strongly voters smell each note ("2776 Bourbon
// Vanilla, 2063 Cinnamon..."), loaded on click. Read it, then switch it back
// off, which leaves the pyramid as it was.
const noteVotes = {};
const show = toggle(/^Show votes$/i);
if (show) {
  (show.closest('button') || show).click();
  for (let i = 0; i < 40 && !pyramid().some(t => /According to Your Votes/i.test(t)); i++) await sleep(250);
}
const pl = pt ? pyramid() : [];
const vi = pl.findIndex(t => /According to Your Votes/i.test(t));
// A note can be voted down below zero ("-3").
if (vi >= 0) for (let i = vi + 1; i < pl.length - 1 && /^-?[\d.,]+k?$/i.test(pl[i]); i += 2) noteVotes[pl[i + 1]] = num(pl[i]);
const hide = toggle(/^Hide votes$/i);
if (show && hide) (hide.closest('button') || hide).click();

const notes = {}; let cur = 'all';
for (const t of pl.slice(vi >= 0 ? vi + 1 + 2 * Object.keys(noteVotes).length : 0)) {
  if (/^(Perfume Pyramid|Fragrance Notes|Show votes|Hide Labels|Show Labels|Hide votes)$/i.test(t)) continue;
  if (/^Top Notes$/i.test(t)) { cur = 'top'; continue; }
  if (/^(Middle|Heart) Notes$/i.test(t)) { cur = 'mid'; continue; }
  if (/^Base Notes$/i.test(t)) { cur = 'base'; continue; }
  if (/vote|ingredient|^\d/i.test(t) || t.length > 40) break;
  (notes[cur] ||= []).push(t);
}

JSON.stringify({
  slug: location.pathname.replace('/perfume/', '').replace('.html', ''),
  h1: document.querySelector('h1')?.textContent.trim().replace(/\s+/g, ' '),
  title: document.title.replace(/\s+/g, ' '),
  rating: +(document.querySelector('[itemprop="ratingValue"]')?.textContent || 0),
  votes: num(document.querySelector('[itemprop="ratingCount"]')?.textContent || '0'),
  accords: acc,
  wear: card(/When To Wear/) ? pairs(leaf(card(/When To Wear/)).slice(1)) : null,
  likes: card(/^Rating/) ? pairs(leaf(card(/^Rating/)).slice(1)) : null,
  notes,
  noteVotes,
});

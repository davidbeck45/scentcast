// Fragella API record -> engine record (same shape as data/collection.json).
// Shared by the app and the Cloudflare Worker.
//
// Calibrated against bottles that exist in both Fragella and the Fragrantica
// scrape: Fragella's season scores run peakier than Fragrantica's votes (often
// with zeros), so they get smoothed; Fragella has no day/night signal and its
// "night out" score didn't predict night wear, so night lean comes from how
// heavy the accords are.
import { heaviness } from './accords.js';

export const FRAGELLA_PREFIX = 'fg:';

const SEASONS = ['winter', 'spring', 'summer', 'fall'];
const LEVEL = { Dominant: 100, Prominent: 75, Moderate: 55, Subtle: 40 };
const UNRATED_ACCORD = 35;
const SEASON_SMOOTH = 0.55;
const SEASON_GAMMA = 0.8;
const NIGHT_PER_HEAVINESS = 0.2;
// Fragella has no vote counts; its popularity tier stands in for engine confidence.
const POPULARITY_VOTES = { 'very high': 20000, high: 5000, medium: 1000, low: 200, 'not popular': 50 };
const GENDER = { men: 'men', women: 'women', unisex: 'women and men' };
const GENERIC_BRAND_WORDS = new Set(['perfumes', 'parfums', 'parfum', 'perfume', 'fragrances', 'paris', 'london']);

const clamp = (x, lo, hi) => Math.min(hi, Math.max(lo, x));
const round3 = x => Math.round(x * 1000) / 1000;

export const isFragellaId = id => String(id).startsWith(FRAGELLA_PREFIX);
export const fragellaSlug = id => String(id).slice(FRAGELLA_PREFIX.length);

// "French Avenue Liquid Brun" / "Dior Sauvage" / "Essence de Blanc Fragrance World unisex"
// -> "Liquid Brun" / "Sauvage" / "Essence de Blanc Fragrance World"
export function cleanName(name = '', brand = '') {
  let n = name.trim().replace(/\s+(for women and men|for men|for women|unisex)$/i, '');
  const words = brand.trim().split(/\s+/).filter(Boolean);
  const prefixes = [brand.trim(), words[0], words.at(-1)]
    .filter(p => p && p.length > 2 && !GENERIC_BRAND_WORDS.has(p.toLowerCase()));
  for (const p of prefixes) {
    if (n.toLowerCase().startsWith(`${p.toLowerCase()} `) && n.length > p.length + 1) {
      n = n.slice(p.length + 1);
      break;
    }
  }
  return n;
}

export function fromFragella(x) {
  const accords = Object.fromEntries(
    (x['Main Accords'] ?? [])
      .map(a => [a, LEVEL[x['Main Accords Percentage']?.[a]] ?? UNRATED_ACCORD])
      .sort((p, q) => q[1] - p[1]),
  );

  const scores = Object.fromEntries((x['Season Ranking'] ?? []).map(d => [d.name, +d.score || 0]));
  const raw = SEASONS.map(s => Math.pow((scores[s] ?? 0) + SEASON_SMOOTH, SEASON_GAMMA));
  const total = raw.reduce((a, b) => a + b, 0);
  const season = Object.fromEntries(SEASONS.map((s, i) => [s, round3(raw[i] / total)]));

  const night = clamp(0.5 + NIGHT_PER_HEAVINESS * heaviness(accords), 0.15, 0.85);

  const notes = {};
  for (const [from, to] of [['Top', 'top'], ['Middle', 'mid'], ['Base', 'base']]) {
    const list = (x.Notes?.[from] ?? []).map(n => n?.name).filter(Boolean);
    if (list.length) notes[to] = list;
  }
  if (!Object.keys(notes).length && x['General Notes']?.length) notes.all = x['General Notes'];

  return {
    id: FRAGELLA_PREFIX + x._id,
    source: 'fragella',
    name: cleanName(x.Name, x.Brand),
    brand: x.Brand ?? '',
    year: parseInt(x.Year, 10) || null,
    gender: GENDER[String(x.Gender).toLowerCase()] ?? null,
    url: null,
    thumb: x['Image URL Transparent'] || x['Image URL'] || null,
    rating: +x.rating || 0,
    ratingVotes: POPULARITY_VOTES[String(x.Popularity).toLowerCase()] ?? 100,
    accords,
    season,
    dayNight: { day: round3(1 - night), night: round3(night) },
    notes,
    longevity: x.Longevity || null,
    sillage: x.Sillage || null,
  };
}

// Bottles no database has, entered by their owner: the main accords (strongest
// first) and, optionally, the seasons and time of day they wear it. Season and
// day/night shares blend those picks with an estimate from how heavy the
// accords are, fitted on the votes of the bottles in data/.
import { ACCORDS, heaviness } from './accords.js';

export const CUSTOM_PREFIX = 'my:';
export const MAX_CUSTOM_ACCORDS = 6;

const SEASONS = ['winter', 'spring', 'summer', 'fall'];
// share = a + b * heaviness, least squares over the voted bottles in data/ (`npm run fit`)
// (R² ≈ 0.7 for seasons, 0.7 for night).
const SEASON_FIT = { winter: [0.203, 0.397], spring: [0.284, -0.265], summer: [0.272, -0.416], fall: [0.241, 0.285] };
const NIGHT_FIT = [0.385, 0.478];
const SEASON_FLOOR = 0.03;
// How much the owner's own season and time picks count against the estimate.
const PICK_WEIGHT = 0.5;
const TIME_TARGET = { day: 0.15, night: 0.85, both: 0.5 };
// Listed order stands in for strength: 100, 88, 76...
const STRENGTH_STEP = 12;

const clamp = (x, lo, hi) => Math.min(hi, Math.max(lo, x));
const round3 = x => Math.round(x * 1000) / 1000;

export const isCustomId = id => String(id).startsWith(CUSTOM_PREFIX);

const accordStrengths = names => Object.fromEntries(
  names.filter(a => ACCORDS[a]).slice(0, MAX_CUSTOM_ACCORDS).map((a, i) => [a, 100 - STRENGTH_STEP * i]),
);

export function estimateSeason(accords, picked = []) {
  const h = heaviness(accords);
  const est = SEASONS.map(s => Math.max(SEASON_FLOOR, SEASON_FIT[s][0] + SEASON_FIT[s][1] * h));
  const estTotal = est.reduce((a, b) => a + b, 0);
  const chosen = SEASONS.filter(s => picked.includes(s));
  const w = chosen.length ? PICK_WEIGHT : 0;
  return Object.fromEntries(SEASONS.map((s, i) =>
    [s, round3((1 - w) * (est[i] / estTotal) + (chosen.includes(s) ? w / chosen.length : 0))]));
}

export function estimateNight(accords, time = null) {
  const est = clamp(NIGHT_FIT[0] + NIGHT_FIT[1] * heaviness(accords), 0.15, 0.85);
  return round3(time in TIME_TARGET ? (1 - PICK_WEIGHT) * est + PICK_WEIGHT * TIME_TARGET[time] : est);
}

const randomId = () => Math.random().toString(36).slice(2, 10);

/**
 * { name, brand?, accords: [accord names, strongest first], seasons?: [...], time?: 'day'|'night'|'both' }
 * -> engine record (same shape as data/collection.json entries).
 */
export function customRecord({ id = null, name, brand = '', accords, seasons = [], time = null }) {
  const strengths = accordStrengths(accords);
  const night = estimateNight(strengths, time);
  return fromParts({
    id: id ?? CUSTOM_PREFIX + randomId(),
    name,
    brand,
    accords: strengths,
    season: estimateSeason(strengths, seasons),
    night,
  });
}

function fromParts({ id, name, brand, accords, season, night }) {
  return {
    id,
    source: 'custom',
    name: String(name).trim(),
    brand: String(brand ?? '').trim(),
    year: null,
    gender: null,
    url: null,
    thumb: null,
    rating: 0,
    ratingVotes: 0,
    accords,
    season,
    dayNight: { day: round3(1 - night), night },
    notes: {},
  };
}

// No server knows these bottles, so share links carry them whole:
// my:<id>~<base64url of [name, brand, [accords], [season %], night %]>
const toBase64Url = s => btoa(String.fromCharCode(...new TextEncoder().encode(s)))
  .replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
const fromBase64Url = s => new TextDecoder().decode(
  Uint8Array.from(atob(s.replace(/-/g, '+').replace(/_/g, '/')), c => c.charCodeAt(0)));

export function shareToken(record) {
  const pct = x => Math.round(x * 100);
  const body = [record.name, record.brand, Object.keys(record.accords), SEASONS.map(s => pct(record.season[s])), pct(record.dayNight.night)];
  return `${record.id}~${toBase64Url(JSON.stringify(body))}`;
}

export function fromShareToken(token) {
  const [id, data] = String(token).split('~');
  if (!/^my:[a-z0-9]{1,16}$/.test(id) || !data) return null;
  try {
    const [name, brand, accordNames, seasonPct, nightPct] = JSON.parse(fromBase64Url(data));
    const accords = accordStrengths(Array.isArray(accordNames) ? accordNames : []);
    const nums = Array.isArray(seasonPct) ? seasonPct.map(Number) : [];
    if (typeof name !== 'string' || !name.trim() || !Object.keys(accords).length) return null;
    if (nums.length !== 4 || !nums.every(n => n >= 0) || !(nums.reduce((a, b) => a + b, 0) > 0) || !(nightPct >= 0 && nightPct <= 100)) return null;
    const total = nums.reduce((a, b) => a + b, 0);
    return fromParts({
      id,
      name: name.slice(0, 80),
      brand: String(brand ?? '').slice(0, 80),
      accords,
      season: Object.fromEntries(SEASONS.map((s, i) => [s, round3(nums[i] / total)])),
      night: round3(nightPct / 100),
    });
  } catch {
    return null;
  }
}

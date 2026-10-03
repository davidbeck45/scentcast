// Recommendation engine. Pure functions only: fragrances + conditions in,
// ranked tiers with reasons out.
import { ACCORDS, heaviness } from './accords.js';
import { isWet } from './wmo.js';

export const SEASONS = ['winter', 'spring', 'summer', 'fall'];

// Feels-like temperature (°F) each season's votes are centered on.
const SEASON_CENTER_F = { winter: 35, fall: 58, spring: 64, summer: 84 };
const SEASON_WIDTH_F = 13;
// Spring and fall overlap in temperature; the calendar breaks the tie.
const CALENDAR_BOOST = 1.35;

const DAILY_WEIGHTS = { season: 0.5, time: 0.25, weather: 0.2, quality: 0.05 };
const OCCASION_WEIGHTS = { occasion: 0.4, season: 0.3, time: 0.1, weather: 0.15, quality: 0.05 };

// Rank cutoffs: first 3 are S, next 5 A, next 6 B, rest C.
const TIER_SIZES = [['S', 3], ['A', 5], ['B', 6]];

const ROTATION_PENALTY = [0.2, 0.12, 0.05]; // worn today, yesterday, 2 days ago

const RAIN_ACCORDS = ['green', 'earthy', 'woody', 'aromatic', 'mossy', 'aquatic'];

const clamp = (x, lo, hi) => Math.min(hi, Math.max(lo, x));
const argmax = obj => Object.entries(obj).reduce((best, e) => (e[1] > best[1] ? e : best))[0];

export function calendarSeason(date, lat = 1) {
  const m = date.getMonth(); // 0 = Jan
  const north = m <= 1 || m === 11 ? 'winter' : m <= 4 ? 'spring' : m <= 7 ? 'summer' : 'fall';
  if (lat >= 0) return north;
  return { winter: 'summer', spring: 'fall', summer: 'winter', fall: 'spring' }[north];
}

// How much each season "is" right now, normalized to sum to 1.
export function targetSeasonWeights(feelsF, date, lat) {
  const cal = calendarSeason(date, lat);
  const w = {};
  let total = 0;
  for (const s of SEASONS) {
    const z = (feelsF - SEASON_CENTER_F[s]) / SEASON_WIDTH_F;
    w[s] = Math.exp(-0.5 * z * z) * (s === cal ? CALENDAR_BOOST : 1);
    total += w[s];
  }
  for (const s of SEASONS) w[s] = total ? w[s] / total : 0.25;
  return w;
}

// Half "is this within the fragrance's comfort zone" (relative to its own best
// season), half "is this its specialty" (lift over an even 25% split). Without
// the lift, all-rounders tie specialists in-season and win everywhere else.
export function seasonFit(frag, weights) {
  const peak = Math.max(...SEASONS.map(s => frag.season[s])) || 1;
  const relative = SEASONS.reduce((sum, s) => sum + weights[s] * (frag.season[s] / peak), 0);
  const lift = SEASONS.reduce((sum, s) => sum + weights[s] * frag.season[s], 0) / 0.25;
  return 0.5 * relative + 0.5 * clamp(lift / 1.6, 0, 1);
}

export function timeFit(frag, slot) {
  const peak = Math.max(frag.dayNight.day, frag.dayNight.night) || 1;
  const lift = frag.dayNight[slot] / 0.5;
  return 0.5 * (frag.dayNight[slot] / peak) + 0.5 * clamp(lift / 1.3, 0, 1);
}

// Dew point (°F) from temperature (°F) and relative humidity (%), Magnus formula.
export function dewPointF(tempF, humidity) {
  const c = ((tempF - 32) * 5) / 9;
  const g = Math.log(clamp(humidity, 1, 100) / 100) + (17.62 * c) / (243.12 + c);
  return ((243.12 * g) / (17.62 - g)) * 9 / 5 + 32;
}

// Mugginess follows the dew point, not relative humidity: about 55°F feels
// comfortable, 65°F sticky, 70°F and up oppressive, whatever the temperature.
// Forecast windows carry dewF; other conditions estimate it from feels-like.
const MUGGY_DEW_F = 60;
const dewOf = c => c.dewF ?? dewPointF(c.feelsF, c.humidity);
export const isSticky = c => c.feelsF > 75 && dewOf(c) >= 65;

// Heaviness the weather calls for: -1 (as fresh as possible) .. +1 (rich).
export function targetHeaviness(conditions) {
  const { feelsF } = conditions;
  let t = clamp((65 - feelsF) / 35, -1, 1);
  if (feelsF > 70) t -= clamp((dewOf(conditions) - MUGGY_DEW_F) / 40, 0, 0.4); // sticky heat
  return clamp(t, -1, 1);
}

function accordShare(accords, names) {
  let hit = 0, total = 0;
  for (const [a, s] of Object.entries(accords)) {
    total += s;
    if (names.includes(a)) hit += s;
  }
  return total ? hit / total : 0;
}

export function weatherFit(frag, conditions) {
  const fit = 1 - Math.abs(heaviness(frag.accords) - targetHeaviness(conditions)) / 2;
  const rain = isWet(conditions.category) ? 0.1 * accordShare(frag.accords, RAIN_ACCORDS) : 0;
  return clamp(fit + rain, 0, 1);
}

// Feels-like range a bottle suits on its own: its season and weather fit,
// weighted as in daily picks, scanned in 1°F steps. The range runs out from
// the peak to where the fit falls COMFORT_DROP below it; lowF / highF are null
// when it runs off the scan (nothing is too cold for a winter scent). bestF,
// the middle of the peak, is only given for a range closed on both ends.
const COMFORT_SCAN = [0, 105];
const COMFORT_DROP = 0.1;

export function comfortRange(frag, { date = new Date(), lat = 40, dewF = 55 } = {}) {
  const W = DAILY_WEIGHTS;
  const fits = [];
  for (let feelsF = COMFORT_SCAN[0]; feelsF <= COMFORT_SCAN[1]; feelsF++) {
    const weights = targetSeasonWeights(feelsF, date, lat);
    const conditions = { feelsF, dewF, category: 'clear' };
    fits.push((W.season * seasonFit(frag, weights) + W.weather * weatherFit(frag, conditions)) / (W.season + W.weather));
  }
  const peak = Math.max(...fits);
  const at = fits.indexOf(peak);
  const edge = (step, floor) => {
    let i = at;
    while (fits[i + step] !== undefined && fits[i + step] >= floor) i += step;
    return i;
  };
  const [peakLo, peakHi] = [edge(-1, peak - 0.01), edge(1, peak - 0.01)];
  const [lo, hi] = [edge(-1, peak - COMFORT_DROP), edge(1, peak - COMFORT_DROP)];
  const toF = i => COMFORT_SCAN[0] + i;
  const lowF = lo === 0 ? null : toF(lo);
  const highF = hi === fits.length - 1 ? null : toF(hi);
  const bestF = lowF !== null && highF !== null ? toF(Math.round((peakLo + peakHi) / 2)) : null;
  return { lowF, highF, bestF };
}

// Community rating, trusted more as votes grow; unknowns sit at neutral 0.5.
export function quality(frag) {
  const confidence = Math.min(1, Math.log10(Math.max(frag.ratingVotes, 1)) / 3);
  return clamp((frag.rating - 3.5) / 1.0, 0, 1) * confidence + 0.5 * (1 - confidence);
}

export function occasionRaw(frag, profile) {
  let sum = 0, total = 0;
  for (const [a, s] of Object.entries(frag.accords)) {
    total += s;
    sum += s * (profile[a] ?? 0);
  }
  return total ? sum / total : 0;
}

export function daysBetween(fromISO, toISO) {
  return Math.round((Date.parse(toISO) - Date.parse(fromISO)) / 86_400_000);
}

// Penalize recent wears so picks rotate. A wear logged for this same slot
// today is the user's current choice, not a reason to demote it.
// Entries marked `planned` are picks from a plan (see planWindows), not wears.
export function rotationPenalty(fragId, history, todayISO, slot) {
  let penalty = 0, daysAgo = null, planned = false;
  for (const h of history) {
    if (h.id !== fragId) continue;
    if (h.date === todayISO && h.slot === slot) continue;
    const d = daysBetween(h.date, todayISO);
    if (d >= 0 && d < ROTATION_PENALTY.length && ROTATION_PENALTY[d] > penalty) {
      penalty = ROTATION_PENALTY[d];
      daysAgo = d;
      planned = !!h.planned;
    }
  }
  return { penalty, daysAgo, planned };
}

function topAccord(accords, predicate) {
  const hit = Object.entries(accords).find(([a]) => ACCORDS[a] && predicate(ACCORDS[a].weight));
  return hit?.[0];
}

// Plain-language reasons, each with a tone and a strength used for ordering.
// Tones come from what the votes and accords say, not from blended scores.
function reasonsFor(frag, parts, ctx) {
  const { conditions, slot, weights, occasion } = ctx;
  const W = occasion ? OCCASION_WEIGHTS : DAILY_WEIGHTS;
  const out = [];
  const good = (text, strength) => out.push({ text, tone: 'good', strength });
  const bad = (text, strength) => out.push({ text, tone: 'bad', strength });

  const nowSeason = argmax(weights);
  const fragSeason = argmax(frag.season);
  const peakShare = frag.season[fragSeason];
  const comfort = SEASONS.reduce((sum, s) => sum + weights[s] * (frag.season[s] / peakShare), 0);
  // Only Fragrantica records carry votes; Fragella's and hand-entered seasons are estimates.
  const voted = Boolean(frag.seasonVotes);
  if (fragSeason === nowSeason && peakShare >= 0.3) good(voted ? `Voted a ${nowSeason} scent` : `A ${nowSeason} scent`, W.season * peakShare * 2);
  else if (comfort >= 0.85 && peakShare < 0.3) good('Versatile across seasons', W.season * 0.4);
  else if (comfort >= 0.85) good(`Fits ${nowSeason} weather`, W.season * 0.5);
  else if (comfort < 0.55) bad(voted ? `Voted for ${fragSeason}, not ${nowSeason}` : `Better in ${fragSeason} than ${nowSeason}`, W.season * (1 - comfort));

  const share = frag.dayNight[slot];
  if (share >= 0.62) good(slot === 'night' ? 'Built for nighttime' : 'Daytime favorite', W.time * share);
  else if (share <= 0.38) bad(slot === 'night' ? 'Better in daylight' : 'More of a night scent', W.time * (1 - share));

  const h = heaviness(frag.accords);
  const sticky = isSticky(conditions);
  if (conditions.feelsF >= 78) {
    const fresh = topAccord(frag.accords, w => w <= -0.3);
    if (h <= -0.1) good(fresh ? `Fresh ${fresh} cuts the heat` : 'Fresh notes cut the heat', W.weather * 0.8);
    else if (h >= 0.25) bad(sticky ? 'Too rich for sticky heat' : 'Heavy for this heat', W.weather);
  } else if (conditions.feelsF <= 52) {
    if (h >= 0.25) good(`Warm ${topAccord(frag.accords, w => w >= 0.7) ?? 'base'} for the cold`, W.weather * 0.8);
    else if (h <= -0.2) bad('Thin in the cold', W.weather * 0.8);
  }
  if (isWet(conditions.category) && accordShare(frag.accords, RAIN_ACCORDS) > 0.3) {
    good('Woody-green notes suit the rain', 0.02);
  }

  if (occasion) {
    const contrib = Object.entries(frag.accords)
      .map(([a, s]) => [a, s * (occasion.profile[a] ?? 0)])
      .sort((x, y) => y[1] - x[1]);
    const fits = contrib.filter(c => c[1] > 20).slice(0, 2).map(c => c[0]);
    const clash = contrib.filter(c => c[1] < -20).at(-1)?.[0];
    const label = occasion.label.toLowerCase();
    if (fits.length) good(`${fits.join(' & ')} suit${fits.length === 1 ? 's' : ''} ${label}`, W.occasion * (0.5 + parts.occasion));
    if (clash) bad(`${clash} is off for ${label}`, W.occasion * (1.5 - parts.occasion) * 0.5);
  }

  if (frag.rating >= 4.35 && frag.ratingVotes >= 1000) good(`Crowd favorite · ${frag.rating.toFixed(1)}★`, 0.03);

  if (parts.planned) {
    if (parts.daysAgo === 0) bad('Already picked for that day', parts.rotation);
    else if (parts.daysAgo > 0) bad(`Picked ${parts.daysAgo === 1 ? 'the day' : `${parts.daysAgo} days`} before`, parts.rotation);
  } else if (parts.daysAgo === 0) bad('Already wearing it today', parts.rotation);
  else if (parts.daysAgo === 1) bad('Worn yesterday', parts.rotation);
  else if (parts.daysAgo === 2) bad('Worn 2 days ago', parts.rotation);

  return out.sort((a, b) => b.strength - a.strength);
}

/**
 * Rank a collection for one time slot.
 * conditions: { feelsF, humidity, dewF?, category, date: Date, lat }
 * slot: 'day' | 'night'
 * opts: { occasion?, history?: [{id, date: 'YYYY-MM-DD'}], todayISO? }
 */
export function rank(fragrances, conditions, slot, opts = {}) {
  const { occasion = null, history = [], todayISO = new Date().toISOString().slice(0, 10) } = opts;
  const weights = targetSeasonWeights(conditions.feelsF, conditions.date, conditions.lat);

  const raws = occasion ? fragrances.map(f => occasionRaw(f, occasion.profile)) : [];
  const lo = Math.min(...raws), hi = Math.max(...raws);

  const scored = fragrances.map((frag, i) => {
    const { penalty, daysAgo, planned } = rotationPenalty(frag.id, history, todayISO, slot);
    const parts = {
      season: seasonFit(frag, weights),
      time: timeFit(frag, slot),
      weather: weatherFit(frag, conditions),
      quality: quality(frag),
      occasion: occasion ? (hi > lo ? (raws[i] - lo) / (hi - lo) : 0.5) : null,
      rotation: penalty,
      daysAgo,
      planned,
    };
    const W = occasion ? OCCASION_WEIGHTS : DAILY_WEIGHTS;
    let score = W.season * parts.season + W.time * parts.time + W.weather * parts.weather + W.quality * parts.quality;
    if (occasion) score += W.occasion * parts.occasion;
    score -= penalty;
    return { fragrance: frag, score, parts };
  });

  scored.sort((a, b) => b.score - a.score);

  let i = 0;
  for (const [tier, size] of TIER_SIZES) {
    for (let n = 0; n < size && i < scored.length; n++, i++) scored[i].tier = tier;
  }
  for (; i < scored.length; i++) scored[i].tier = 'C';

  const ctx = { conditions, slot, weights, occasion };
  for (const s of scored) s.reasons = reasonsFor(s.fragrance, s.parts, ctx);
  return scored;
}

// How far below the top score a bottle not yet in the plan can sit and still
// take the slot. Keeps one all-rounder from filling the whole week.
const PLAN_MARGIN = 0.06;

/**
 * Plan a run of windows in time order (e.g. the week ahead, day then night).
 * Each planned pick counts as worn for the windows after it, and a bottle not
 * yet in the plan wins over a repeat when it scores within PLAN_MARGIN.
 * A wear already logged for a window is kept as that window's pick.
 * Returns [{ win, ranked, pick }].
 */
export function planWindows(fragrances, windows, opts = {}) {
  const { occasion = null, history = [] } = opts;
  let planned = [...history];
  const used = new Set();
  return windows.map(win => {
    const ranked = rank(fragrances, win, win.slot, { occasion, history: planned, todayISO: win.dateISO });
    const logged = history.find(h => h.date === win.dateISO && h.slot === win.slot);
    const fresh = ranked.find(r => !used.has(r.fragrance.id));
    let pick = logged && ranked.find(r => r.fragrance.id === logged.id);
    if (!pick) pick = fresh && ranked[0].score - fresh.score <= PLAN_MARGIN ? fresh : ranked[0];
    if (pick) {
      used.add(pick.fragrance.id);
      if (!logged) planned = [{ id: pick.fragrance.id, date: win.dateISO, slot: win.slot, planned: true }, ...planned];
    }
    return { win, ranked, pick: pick ?? null };
  });
}

export function groupTiers(ranked) {
  const tiers = { S: [], A: [], B: [], C: [] };
  for (const r of ranked) tiers[r.tier].push(r);
  return tiers;
}

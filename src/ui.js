// HTML templates. Everything user-visible is built here; main.js owns state.
import { accordColor } from './accords.js';
import { renderScene } from './scene.js';
import { calendarSeason, SEASONS } from './engine.js';
import { OCCASIONS } from './occasions.js';

export const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
export const deg = f => `${Math.round(f)}°`;
const TIERS = ['S', 'A', 'B', 'C'];

export const icon = {
  pin: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 22s7-6.2 7-12a7 7 0 1 0-14 0c0 5.8 7 12 7 12Z" fill="none" stroke="currentColor" stroke-width="2"/><circle cx="12" cy="10" r="2.5" fill="currentColor"/></svg>',
  sun: '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="4.5" fill="currentColor"/><g stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M12 2v2.5M12 19.5V22M2 12h2.5M19.5 12H22M4.9 4.9l1.8 1.8M17.3 17.3l1.8 1.8M4.9 19.1l1.8-1.8M17.3 6.7l1.8-1.8"/></g></svg>',
  moon: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M20 14.5A8.5 8.5 0 0 1 9.5 4a8.5 8.5 0 1 0 10.5 10.5Z" fill="currentColor"/></svg>',
  refresh: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M20 11a8 8 0 1 0-2.3 5.7M20 4v7h-7" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>',
  external: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M14 4h6v6M20 4l-9 9M18 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h5" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>',
  check: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 12.5l4.5 4.5L19 7.5" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"/></svg>',
  spray: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M8 9h6v11a1 1 0 0 1-1 1H9a1 1 0 0 1-1-1V9Zm1-4h4v4H9zM15 6h2M18 4l1-1M18 8l1 1" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>',
  hide: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 3l18 18M10.6 10.6a2 2 0 0 0 2.8 2.8M9.4 5.2A9.7 9.7 0 0 1 12 5c5 0 8.5 4.3 9.5 7-.4 1-1.2 2.4-2.4 3.7M6.1 6.2C4.2 7.5 3 9.4 2.5 12c1 2.7 4.5 7 9.5 7 1.6 0 3-.4 4.3-1.1" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>',
  close: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 6l12 12M18 6 6 18" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"/></svg>',
};

function feelWords(win) {
  const words = [];
  if (win.feelsF >= 65 && win.humidity >= 75) words.push('muggy');
  else if (win.feelsF >= 65 && win.humidity >= 62) words.push('humid');
  else if (win.humidity < 35) words.push('dry');
  if (win.pop >= 30) words.push(`${win.pop}% rain`);
  return words;
}

function windowRange(win, nowHour) {
  const fmt = h => (h === 0 ? '12a' : h < 12 ? `${h}a` : h === 12 ? '12p' : `${h - 12}p`);
  const [start, end] = win.slot === 'day' ? [10, 17] : [19, 23];
  const today = win.label === 'Today' || win.label === 'Tonight';
  return `${today && nowHour > start ? 'Now' : fmt(start)}–${fmt(end)}`;
}

// ---------- Hero ----------

export function heroPicksHTML(picks) {
  if (!picks) return '';
  return `<div class="hero-picks">${picks.map(({ slot, label, entry }) => `
    <button class="hero-pick" data-jump="${slot}">
      <img src="${esc(entry.fragrance.thumb)}" alt="" width="150" height="170">
      <span><small>${slot === 'day' ? icon.sun : icon.moon}${esc(label)}</small><b>${esc(entry.fragrance.name)}</b></span>
    </button>`).join('')}</div>`;
}

export function heroHTML({ loc, wx, loading, error }, aspect, picks) {
  const now = wx?.now;
  const phase = now?.phase ?? 'day';
  const scene = renderScene({
    phase,
    category: now?.category ?? 'partly',
    sunProgress: now?.sunProgress ?? 0.45,
    season: calendarSeason(new Date(), loc?.lat ?? 1),
    cold: now ? now.feelsF < 50 : false,
    aspect,
    label: now ? `${now.label}, ${deg(now.tempF)}` : 'Weather scene',
  });
  const locBtn = `<button class="loc-btn" data-action="location">${icon.pin}<span>${esc(loc?.name ?? 'Set location')}</span></button>`;
  let body;
  if (now) {
    body = `
      <div class="hero-temp">${Math.round(now.tempF)}<span class="deg">°</span></div>
      <div class="hero-meta">
        <div class="hero-cond">${esc(now.label)}</div>
        <div class="hero-sub">Feels ${deg(now.feelsF)} · H ${deg(now.hiF)} L ${deg(now.loF)} · ${Math.round(now.humidity)}% humidity</div>
      </div>`;
  } else if (error) {
    body = `<div class="hero-meta"><div class="hero-cond">Weather unavailable</div><div class="hero-sub">${esc(error)}</div></div>`;
  } else {
    body = `<div class="hero-meta"><div class="hero-cond">${loading ? 'Checking the sky…' : 'Where are you?'}</div><div class="hero-sub">${loading ? '' : 'Set a location to get picks.'}</div></div>`;
  }
  return `
    <div class="hero-scene">${scene}</div>
    <div class="hero-shade"></div>
    <div class="hero-top">${locBtn}<span class="wordmark">Scentcast</span></div>
    <div class="hero-bottom">${body}</div>
    ${heroPicksHTML(picks)}`;
}

// ---------- Cards ----------

function chips(accords, n = 3) {
  return Object.keys(accords).slice(0, n)
    .map(a => `<span class="chip" style="--c:${accordColor(a)}">${esc(a)}</span>`).join('');
}

function displayReasons(entry, n) {
  const good = entry.reasons.filter(r => r.tone === 'good');
  const bad = entry.reasons.filter(r => r.tone === 'bad');
  const ordered = entry.tier === 'S' || entry.tier === 'A' ? [...good, ...bad] : [...bad, ...good];
  return ordered.slice(0, n);
}

function reasonsList(reasons, cls = '') {
  if (!reasons.length) return '';
  const cap = t => t.charAt(0).toUpperCase() + t.slice(1);
  return `<ul class="reasons ${cls}">${reasons.map(r => `<li class="${r.tone}">${esc(cap(r.text))}</li>`).join('')}</ul>`;
}

function wearButton(entry, ctx, wornId) {
  const on = wornId === entry.fragrance.id;
  return `<button class="wear-btn${on ? ' on' : ''}" data-wear data-ctx="${ctx}" data-id="${entry.fragrance.id}" aria-pressed="${on}">
    ${on ? icon.check : icon.spray}<span>${on ? 'Wearing' : 'Wear this'}</span></button>`;
}

export function slotHeaderHTML(win, nowHour) {
  const thumb = renderScene({
    phase: win.slot === 'day' ? 'day' : 'night',
    category: win.category,
    sunProgress: 0.42,
    season: calendarSeason(win.date, win.lat),
    cold: win.feelsF < 50,
    aspect: 78 / 54,
    label: `${win.label}: ${win.condition}`,
  });
  const line = [windowRange(win, nowHour), win.condition, `feels ${deg(win.feelsF)}`, ...feelWords(win)].join(' · ');
  return `
    <header class="slot-head">
      <div class="slot-thumb">${thumb}</div>
      <div class="slot-title">
        <h2>${win.slot === 'day' ? icon.sun : icon.moon}${esc(win.label)}</h2>
        <p>${esc(line)}</p>
      </div>
    </header>`;
}

export function pickHTML(entry, ctx, wornId, kicker) {
  const f = entry.fragrance;
  const top = Object.keys(f.accords)[0];
  return `
    <article class="pick" style="--accent:${accordColor(top)}">
      <button class="pick-bottle" data-open data-ctx="${ctx}" data-id="${f.id}" aria-label="Details for ${esc(f.name)}">
        <img src="${esc(f.thumb)}" alt="" width="150" height="170">
      </button>
      <div class="pick-info">
        <div class="kicker"><span class="tier-chip" data-tier="${entry.tier}">${entry.tier}</span>${esc(kicker)}</div>
        <h3>${esc(f.name)}</h3>
        <div class="brand">${esc(f.brand)}</div>
        ${reasonsList(displayReasons(entry, 2))}
        <div class="chips">${chips(f.accords)}</div>
        <div class="pick-actions">${wearButton(entry, ctx, wornId)}</div>
      </div>
    </article>`;
}

export function tierListHTML(ranked, ctx, wornId, expanded) {
  const rows = TIERS.map(t => {
    const items = ranked.filter(r => r.tier === t).map(r => {
      const f = r.fragrance;
      return `<button class="bottle${wornId === f.id ? ' worn' : ''}" data-open data-ctx="${ctx}" data-id="${f.id}" title="${esc(f.name)} · ${esc(f.brand)}">
        <img src="${esc(f.thumb)}" alt="" loading="lazy" width="150" height="170">
        <span>${esc(f.name)}</span>
      </button>`;
    }).join('');
    return `<div class="tier" data-tier="${t}"><div class="tier-label">${t}</div><div class="tier-items">${items}</div></div>`;
  });
  const hiddenCount = ranked.filter(r => r.tier === 'B' || r.tier === 'C').length;
  return `<div class="tierlist">
    ${rows.slice(0, 2).join('')}
    ${expanded ? rows.slice(2).join('') : ''}
    <button class="more-btn" data-expand="${ctx}" aria-expanded="${expanded}">
      ${expanded ? 'Show less' : `Show B & C tiers · ${hiddenCount} more`}
    </button>
  </div>`;
}

// ---------- Occasion controls ----------

export function occasionPickerHTML(activeId) {
  return `<div class="occasions" role="radiogroup" aria-label="Occasion">
    ${OCCASIONS.map(o => `<button class="occ${o.id === activeId ? ' on' : ''}" role="radio" aria-checked="${o.id === activeId}" data-occasion="${o.id}">
      <span class="occ-icon" aria-hidden="true">${o.icon}</span>
      <span class="occ-label">${esc(o.label)}</span>
      <span class="occ-blurb">${esc(o.blurb)}</span>
    </button>`).join('')}
  </div>`;
}

export function slotToggleHTML(slot, wx) {
  const btn = (s, text) => `<button data-occ-slot="${s}" aria-pressed="${slot === s}">${s === 'day' ? icon.sun : icon.moon}${esc(text)}</button>`;
  return `<div class="seg">${btn('day', wx.day.label)}${btn('night', wx.night.label)}</div>`;
}

// ---------- Detail sheet ----------

function bar(label, pct, color, value) {
  return `<div class="bar"><span class="bar-label">${esc(label)}</span>
    <span class="bar-track"><span class="bar-fill" style="width:${pct.toFixed(1)}%;--c:${color}"></span></span>
    <span class="bar-value">${esc(value)}</span></div>`;
}

const SEASON_COLORS = { winter: '#8fc7f0', spring: '#9be39a', summer: '#f6a08f', fall: '#f2b264', day: '#f5c451', night: '#8ea3d9' };
const GENDER = { men: 'for men', women: 'for women', 'women and men': 'unisex' };

export function sheetHTML(entry, ctxLabel, ctx, wornId) {
  const f = entry.fragrance;
  const peak = Math.max(...SEASONS.map(s => f.season[s]));
  const seasonBars = SEASONS.map(s => bar(s, (f.season[s] / peak) * 100, SEASON_COLORS[s], `${Math.round(f.season[s] * 100)}%`)).join('');
  const dnPeak = Math.max(f.dayNight.day, f.dayNight.night);
  const dnBars = ['day', 'night'].map(s => bar(s, (f.dayNight[s] / dnPeak) * 100, SEASON_COLORS[s], `${Math.round(f.dayNight[s] * 100)}%`)).join('');
  const accordBars = Object.entries(f.accords).map(([a, v]) => bar(a, v, accordColor(a), '')).join('');
  const layers = [['top', 'Top'], ['mid', 'Heart'], ['base', 'Base'], ['all', 'Notes']]
    .filter(([k]) => f.notes[k]?.length)
    .map(([k, label]) => `<div class="layer"><span class="layer-label">${label}</span><div class="notes">${f.notes[k].map(n => `<span class="note">${esc(n)}</span>`).join('')}</div></div>`)
    .join('');
  const meta = [f.brand, f.year, GENDER[f.gender]].filter(Boolean).map(esc).join(' · ');
  return `
    <div class="sheet-backdrop" data-close></div>
    <div class="sheet-panel" role="dialog" aria-modal="true" aria-labelledby="sheet-title">
      <button class="icon-btn sheet-close" data-close aria-label="Close">${icon.close}</button>
      <div class="sheet-head">
        <img src="${esc(f.thumb)}" alt="" width="150" height="170">
        <div>
          <div class="kicker"><span class="tier-chip" data-tier="${entry.tier}">${entry.tier}</span>${esc(ctxLabel)}</div>
          <h2 id="sheet-title">${esc(f.name)}</h2>
          <div class="brand">${meta}</div>
          <div class="rating">★ ${f.rating.toFixed(2)} <span>${f.ratingVotes.toLocaleString()} votes on Fragrantica</span></div>
        </div>
      </div>
      ${reasonsList(entry.reasons, 'full')}
      <div class="sheet-actions">
        ${wearButton(entry, ctx, wornId)}
        <a class="ghost-btn" href="${esc(f.url)}" target="_blank" rel="noopener">Fragrantica ${icon.external}</a>
        <button class="ghost-btn quiet" data-toggle-hidden="${f.id}">${icon.hide}Hide from picks</button>
      </div>
      <section><h4>Main accords</h4><div class="bars accords">${accordBars}</div></section>
      <section class="two-col">
        <div><h4>Seasons voted</h4><div class="bars">${seasonBars}</div></div>
        <div><h4>Time of day</h4><div class="bars">${dnBars}</div></div>
      </section>
      <section><h4>Notes</h4><div class="pyramid">${layers}</div></section>
    </div>`;
}

export function manageSheetHTML(fragrances, hidden) {
  const on = fragrances.length - hidden.size;
  const rows = fragrances.map(f => {
    const active = !hidden.has(f.id);
    return `<li class="${active ? '' : 'off'}">
      <img src="${esc(f.thumb)}" alt="" loading="lazy" width="150" height="170">
      <span class="manage-name"><b>${esc(f.name)}</b><small>${esc(f.brand)}</small></span>
      <button class="switch" role="switch" aria-checked="${active}" data-toggle-hidden="${f.id}" aria-label="Include ${esc(f.name)} in picks"><span></span></button>
    </li>`;
  }).join('');
  return `
    <div class="sheet-backdrop" data-close></div>
    <div class="sheet-panel narrow" role="dialog" aria-modal="true" aria-labelledby="manage-title">
      <button class="icon-btn sheet-close" data-close aria-label="Close">${icon.close}</button>
      <h2 id="manage-title">Your collection</h2>
      <p class="muted">${on} of ${fragrances.length} in rotation. Switch a bottle off to leave it out of picks on this device.</p>
      <ul class="manage-list">${rows}</ul>
    </div>`;
}

export function locationSheetHTML({ busy = false, error = '', results = null, query = '' } = {}) {
  const list = results === null ? ''
    : results.length === 0 ? '<p class="muted">No matches. Try a bigger nearby city.</p>'
    : `<ul class="city-results">${results.map((r, i) => `<li><button data-city="${i}"><strong>${esc(r.name)}</strong><span>${esc(r.region)}</span></button></li>`).join('')}</ul>`;
  return `
    <div class="sheet-backdrop" data-close></div>
    <div class="sheet-panel narrow" role="dialog" aria-modal="true" aria-labelledby="loc-title">
      <button class="icon-btn sheet-close" data-close aria-label="Close">${icon.close}</button>
      <h2 id="loc-title">Where are you?</h2>
      <p class="muted">Used only to fetch your local forecast from Open-Meteo.</p>
      <button class="primary-btn" data-action="geo" ${busy ? 'disabled' : ''}>${icon.pin}<span>${busy ? 'Locating…' : 'Use my location'}</span></button>
      <div class="or"><span>or</span></div>
      <form class="city-form" data-form="city">
        <input type="search" name="q" placeholder="Search a city" autocomplete="off" value="${esc(query)}" aria-label="City">
        <button type="submit">Search</button>
      </form>
      ${error ? `<p class="error">${esc(error)}</p>` : ''}
      ${list}
    </div>`;
}

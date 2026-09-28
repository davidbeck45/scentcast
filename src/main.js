import { rank } from './engine.js';
import { occasionById } from './occasions.js';
import { getForecast, summarize } from './weather.js';
import { loadLocation, saveLocation, deviceLocation, searchCities } from './location.js';
import { loadHistory, toggleWear, wornIn } from './history.js';
import { loadHidden, saveHidden } from './hidden.js';
import { sceneTint } from './scene.js';
import * as ui from './ui.js';

const PREFS_KEY = 'scentcast.prefs';
const REFRESH_AFTER = 20 * 60 * 1000;

const $ = sel => document.querySelector(sel);

function loadPrefs() {
  try { return JSON.parse(localStorage.getItem(PREFS_KEY)) ?? {}; } catch { return {}; }
}
function savePrefs() {
  try { localStorage.setItem(PREFS_KEY, JSON.stringify({ view: state.view, occasion: state.occasion })); } catch {}
}

const prefs = loadPrefs();
const state = {
  collection: null,
  loc: loadLocation(),
  forecast: null,
  wx: null,
  loading: false,
  error: null,
  view: prefs.view ?? 'today',
  occasion: prefs.occasion ?? 'casual',
  occasionSlot: null,
  history: loadHistory(),
  hidden: loadHidden(), // ids left out of rankings on this device
  contexts: {}, // ctx key -> { win, occasion, entries: Map(id -> ranked entry) }
  today: null, // { day: ranked[], night: ranked[] }
  expanded: new Set(), // ctx keys showing B and C tiers
  sheet: null, // { kind: 'detail', ctx, id } | { kind: 'location', ...form state }
};

// ---------- Rendering ----------

function heroAspect() {
  const el = $('#hero');
  return el.clientHeight ? el.clientWidth / el.clientHeight : 400 / 220;
}

function heroPicks() {
  if (!state.today) return null;
  return ['day', 'night'].map(slot => ({ slot, label: state.wx[slot].label, entry: state.today[slot][0] }));
}

function renderHero() {
  state.heroAspect = heroAspect();
  $('#hero').innerHTML = ui.heroHTML(state, state.heroAspect, heroPicks());
  const now = state.wx?.now;
  const [top, mid] = sceneTint(now?.phase ?? 'night', now?.category ?? 'clear');
  document.documentElement.style.setProperty('--tint-top', top);
  document.documentElement.style.setProperty('--tint-mid', mid);
}

function activeFragrances() {
  return state.collection.fragrances.filter(f => !state.hidden.has(f.id));
}

function rankContext(key, win, occasion) {
  const ranked = rank(activeFragrances(), win, win.slot, {
    occasion,
    history: state.history,
    todayISO: win.dateISO,
  });
  state.contexts[key] = { win, occasion, entries: new Map(ranked.map(r => [r.fragrance.id, r])) };
  return ranked;
}

function computeToday() {
  state.today = state.wx && state.collection && activeFragrances().length
    ? { day: rankContext('day', state.wx.day, null), night: rankContext('night', state.wx.night, null) }
    : null;
}

function slotSection(key, ranked, kicker) {
  const { win } = state.contexts[key];
  const worn = wornIn(state.history, win.dateISO, win.slot)?.id ?? null;
  return `
    <section class="slot" id="slot-${key}" data-slot="${win.slot}">
      ${ui.slotHeaderHTML(win, nowHour())}
      ${ui.pickHTML(ranked[0], key, worn, kicker)}
      ${ui.tierListHTML(ranked, key, worn, state.expanded.has(key))}
    </section>`;
}

function nowHour() {
  const offset = state.forecast?.utc_offset_seconds ?? 0;
  return new Date(Date.now() + offset * 1000).getUTCHours();
}

function messageCard(title, body, action = '') {
  return `<div class="message"><h2>${ui.esc(title)}</h2><p>${ui.esc(body)}</p>${action}</div>`;
}

function renderView() {
  document.querySelectorAll('[data-view]').forEach(b => b.setAttribute('aria-selected', String(b.dataset.view === state.view)));
  const view = $('#view');

  if (!state.loc) {
    view.innerHTML = messageCard('Set your location', 'Picks are based on your local forecast.',
      `<button class="primary-btn" data-action="location">${ui.icon.pin}<span>Choose location</span></button>`);
    return;
  }
  if (!state.wx) {
    view.innerHTML = state.error
      ? messageCard('Couldn’t load the weather', state.error, `<button class="primary-btn" data-action="refresh">${ui.icon.refresh}<span>Try again</span></button>`)
      : '<div class="loading" aria-live="polite"><span></span><span></span><span></span></div>';
    return;
  }
  if (!activeFragrances().length) {
    view.innerHTML = messageCard('Every bottle is hidden', 'Turn some back on to get picks.',
      `<button class="primary-btn" data-action="manage"><span>Manage collection</span></button>`);
    return;
  }

  if (state.view === 'today') {
    view.innerHTML = `<div class="slots">
      ${slotSection('day', state.today.day, `Top pick · ${state.wx.day.label.toLowerCase()}`)}
      ${slotSection('night', state.today.night, `Top pick · ${state.wx.night.label.toLowerCase()}`)}
    </div>`;
  } else {
    const occasion = occasionById(state.occasion) ?? occasionById('casual');
    const slot = state.occasionSlot ?? occasion.slot;
    const ranked = rankContext('occ', state.wx[slot], occasion);
    view.innerHTML = `
      ${ui.occasionPickerHTML(occasion.id)}
      <div class="occ-bar">${ui.slotToggleHTML(slot, state.wx)}</div>
      <div class="slots single">${slotSection('occ', ranked, `Best for ${occasion.label.toLowerCase()}`)}</div>`;
  }
}

function renderFooter() {
  const c = state.collection;
  if (!c) return;
  const updated = state.wx
    ? `Weather ${state.wx.stale ? 'offline · ' : ''}updated ${new Date(state.wx.fetchedAt).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}`
    : '';
  $('#foot').innerHTML = `
    <span>${c.fragrances.length - state.hidden.size} of ${c.fragrances.length} bottles in rotation · <button class="link-btn" data-action="manage">Manage</button></span>
    <span>From Fragrantica · synced ${ui.esc(c.fetched)}</span>
    <span>${updated} <button class="icon-btn small" data-action="refresh" aria-label="Refresh weather">${ui.icon.refresh}</button></span>
    <span class="muted">Forecast by <a href="https://open-meteo.com" target="_blank" rel="noopener">Open-Meteo</a></span>`;
}

function render() {
  computeToday();
  renderHero();
  renderView();
  renderFooter();
  if (state.sheet) renderSheet();
}

// ---------- Sheet ----------

function renderSheet() {
  const el = $('#sheet');
  const s = state.sheet;
  if (s.kind === 'detail') {
    const ctx = state.contexts[s.ctx];
    const entry = ctx?.entries.get(s.id);
    if (!entry) return closeSheet();
    const label = ctx.occasion ? `${ctx.occasion.label} · ${ctx.win.label.toLowerCase()}` : ctx.win.label;
    const worn = wornIn(state.history, ctx.win.dateISO, ctx.win.slot)?.id ?? null;
    el.innerHTML = ui.sheetHTML(entry, label, s.ctx, worn);
  } else if (s.kind === 'manage') {
    el.innerHTML = ui.manageSheetHTML(state.collection.fragrances, state.hidden);
  } else {
    el.innerHTML = ui.locationSheetHTML(s);
  }
}

function openSheet(sheet) {
  const wasOpen = !!state.sheet;
  state.sheet = sheet;
  renderSheet();
  const el = $('#sheet');
  el.hidden = false;
  document.body.classList.add('sheet-open');
  if (!wasOpen) requestAnimationFrame(() => el.classList.add('open'));
  if (!wasOpen) el.querySelector(sheet.kind === 'location' ? 'input' : '.sheet-close')?.focus({ preventScroll: true });
}

function closeSheet() {
  const el = $('#sheet');
  state.sheet = null;
  el.classList.remove('open');
  document.body.classList.remove('sheet-open');
  setTimeout(() => { if (!state.sheet) { el.hidden = true; el.innerHTML = ''; } }, 220);
}

// ---------- Hiding bottles ----------

let toastTimer;
function showToast(html) {
  const el = $('#toast');
  el.innerHTML = html;
  el.hidden = false;
  requestAnimationFrame(() => el.classList.add('show'));
  clearTimeout(toastTimer);
  toastTimer = setTimeout(hideToast, 5000);
}
function hideToast() {
  const el = $('#toast');
  el.classList.remove('show');
  setTimeout(() => { if (!el.classList.contains('show')) el.hidden = true; }, 200);
}

function setHidden(id, hide) {
  if (hide) state.hidden.add(id);
  else state.hidden.delete(id);
  saveHidden(state.hidden);
  computeToday();
  renderHero();
  renderView();
  renderFooter();
}

// ---------- Data ----------

async function refreshWeather({ force = false } = {}) {
  if (!state.loc) return;
  state.loading = true;
  state.error = null;
  if (!state.wx) render();
  try {
    if (force) localStorage.removeItem('scentcast.weather');
    state.forecast = await getForecast(state.loc);
    state.wx = summarize(state.forecast);
  } catch (err) {
    state.error = err.message;
  } finally {
    state.loading = false;
  }
  render();
}

async function setLocation(loc) {
  state.loc = loc;
  state.wx = null;
  saveLocation(loc);
  closeSheet();
  await refreshWeather();
}

// ---------- Events ----------

document.addEventListener('click', async e => {
  const t = e.target.closest('button, [data-close], a');
  if (!t) return;
  const d = t.dataset;

  if (d.toggleHidden) {
    const id = +d.toggleHidden;
    const hide = !state.hidden.has(id);
    setHidden(id, hide);
    if (state.sheet?.kind === 'manage') {
      const scroll = $('#sheet .sheet-panel').scrollTop;
      renderSheet();
      $('#sheet .sheet-panel').scrollTop = scroll;
      $(`#sheet [data-toggle-hidden="${id}"]`)?.focus({ preventScroll: true });
    } else if (hide) {
      closeSheet();
      const name = state.collection.fragrances.find(f => f.id === id)?.name ?? 'Bottle';
      showToast(`<span>${ui.esc(name)} hidden from picks</span><button data-action="unhide" data-id="${id}">Undo</button>`);
    }
  } else if (d.action === 'unhide') {
    setHidden(+d.id, false);
    hideToast();
  } else if (d.action === 'manage') {
    openSheet({ kind: 'manage' });
  } else if (d.view) {
    state.view = d.view;
    savePrefs();
    renderView();
  } else if (d.close !== undefined) {
    closeSheet();
  } else if (d.wear !== undefined) {
    const ctx = state.contexts[d.ctx];
    state.history = toggleWear(+d.id, ctx.win.dateISO, ctx.win.slot);
    computeToday();
    const picks = $('.hero-picks');
    if (picks) picks.outerHTML = ui.heroPicksHTML(heroPicks());
    renderView();
    if (state.sheet) renderSheet();
  } else if (d.expand) {
    if (state.expanded.has(d.expand)) state.expanded.delete(d.expand);
    else state.expanded.add(d.expand);
    renderView();
  } else if (d.jump) {
    if (state.view !== 'today') { state.view = 'today'; savePrefs(); renderView(); }
    document.getElementById(`slot-${d.jump}`)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  } else if (d.open !== undefined) {
    openSheet({ kind: 'detail', ctx: d.ctx, id: +d.id });
  } else if (d.occasion) {
    state.occasion = d.occasion;
    state.occasionSlot = null;
    savePrefs();
    renderView();
  } else if (d.occSlot) {
    state.occasionSlot = d.occSlot;
    renderView();
  } else if (d.city !== undefined) {
    const r = state.sheet?.results?.[+d.city];
    if (r) await setLocation({ name: r.name, region: r.region, lat: r.lat, lon: r.lon });
  } else if (d.action === 'location') {
    openSheet({ kind: 'location' });
  } else if (d.action === 'refresh') {
    await refreshWeather({ force: true });
  } else if (d.action === 'geo') {
    openSheet({ ...state.sheet, busy: true, error: '' });
    try {
      await setLocation(await deviceLocation());
    } catch (err) {
      if (state.sheet) openSheet({ ...state.sheet, busy: false, error: err.message });
    }
  }
});

document.addEventListener('submit', async e => {
  if (e.target.dataset.form !== 'city') return;
  e.preventDefault();
  const query = new FormData(e.target).get('q').trim();
  if (!query) return;
  try {
    openSheet({ kind: 'location', query, results: await searchCities(query) });
  } catch (err) {
    openSheet({ kind: 'location', query, error: err.message });
  }
});

let resizeTimer;
window.addEventListener('resize', () => {
  clearTimeout(resizeTimer);
  resizeTimer = setTimeout(() => {
    if (Math.abs(heroAspect() - state.heroAspect) / state.heroAspect > 0.05) renderHero();
  }, 150);
});

document.addEventListener('keydown', e => {
  if (e.key === 'Escape' && state.sheet) closeSheet();
});

document.addEventListener('visibilitychange', () => {
  if (document.visibilityState !== 'visible' || !state.loc) return;
  if (!state.wx || Date.now() - state.wx.fetchedAt > REFRESH_AFTER) refreshWeather();
  else { state.wx = summarize(state.forecast); render(); }
});

// ---------- Boot ----------

// ?loc=lat,lon,Name pins a location, e.g. for a home-screen shortcut per city.
function locationFromURL() {
  const raw = new URLSearchParams(location.search).get('loc');
  if (!raw) return null;
  const [lat, lon, ...name] = raw.split(',');
  if (!Number.isFinite(+lat) || !Number.isFinite(+lon)) return null;
  return { name: name.join(',').trim() || 'Pinned location', lat: +lat, lon: +lon };
}

async function boot() {
  const pinned = locationFromURL();
  if (pinned) state.loc = pinned;
  render();
  try {
    state.collection = await (await fetch('data/collection.json')).json();
  } catch {
    $('#view').innerHTML = messageCard('Collection missing', 'Couldn’t load data/collection.json.');
    return;
  }
  renderFooter();
  if (state.loc) await refreshWeather();
  else { render(); openSheet({ kind: 'location' }); }

  if ('serviceWorker' in navigator) navigator.serviceWorker.register('sw.js').catch(() => {});
}

boot();

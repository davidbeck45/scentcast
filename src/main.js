import { rank } from './engine.js';
import { occasionById } from './occasions.js';
import { getForecast, summarize } from './weather.js';
import { loadLocation, saveLocation, deviceLocation, searchCities } from './location.js';
import { loadHistory, toggleWear, wornIn } from './history.js';
import { loadHidden, saveHidden } from './hidden.js';
import { loadMine, saveMine, loadActive, saveActive, shareURL, parseShare, localMatches, sameBottle, importLines, MAX_IMPORT_LINES } from './collections.js';
import { apiReady, searchFragrances, fetchFragrances } from './api.js';
import { isFragellaId } from './fragella.js';
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
  demo: null, // { fetched, fragrances } from data/collection.json
  mine: loadMine(), // { name, records }
  active: loadActive(), // 'demo' | 'mine'
  shared: null, // { name, ids, records, missing, loading, confirmReplace } from a ?c= link
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
  sheet: null, // { kind: 'detail' | 'location' | 'collection' | 'add' | 'import', ...sheet state }
  lastRemoved: null, // { record, index } for undo
};

// ---------- Collections ----------

function sourceRecords() {
  if (state.shared) return state.shared.records;
  if (state.active === 'mine') return state.mine.records;
  return state.demo?.fragrances ?? [];
}

function activeFragrances() {
  return sourceRecords().filter(f => !state.hidden.has(f.id));
}

function collectionLabel() {
  if (state.shared) return state.shared.name ? `${state.shared.name}’s collection` : 'Shared collection';
  return state.active === 'mine' ? 'My collection' : 'Demo collection';
}

function findRecord(id) {
  return [...sourceRecords(), ...state.mine.records, ...(state.demo?.fragrances ?? [])].find(f => f.id === id);
}

function setActive(active) {
  state.active = active;
  saveActive(active);
  if (state.shared) closeShared();
}

function addToMine(record) {
  if (!state.mine.records.some(r => r.id === record.id)) {
    state.mine.records = [...state.mine.records, record];
    saveMine(state.mine);
  }
  if (state.hidden.delete(record.id)) saveHidden(state.hidden);
  if (state.active !== 'mine' || state.shared) setActive('mine');
}

function closeShared() {
  state.shared = null;
  const url = new URL(location.href);
  url.searchParams.delete('c');
  url.searchParams.delete('n');
  history.replaceState(null, '', url);
}

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
  $('#hero').innerHTML = ui.heroHTML(state, state.heroAspect, heroPicks(), collectionLabel());
  const now = state.wx?.now;
  const [top, mid] = sceneTint(now?.phase ?? 'night', now?.category ?? 'clear');
  document.documentElement.style.setProperty('--tint-top', top);
  document.documentElement.style.setProperty('--tint-mid', mid);
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
  state.today = state.wx && activeFragrances().length
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

function emptyState() {
  if (state.shared) {
    return state.shared.loading
      ? '<div class="loading" aria-live="polite"><span></span><span></span><span></span></div>'
      : messageCard('Nothing to show', 'None of the bottles in this link could be loaded.',
        `<button class="primary-btn" data-action="shared-close"><span>Back to my picks</span></button>`);
  }
  if (!sourceRecords().length) {
    return messageCard('Your collection is empty', 'Add the bottles you own and picks start right away.',
      `<div class="message-actions">
        <button class="primary-btn" data-action="add">${ui.icon.plus}<span>Add bottles</span></button>
        <button class="ghost-btn" data-action="import">${ui.icon.paste}Paste a list</button>
        <button class="link-btn" data-collection-tab="demo">Use the demo collection</button>
      </div>`);
  }
  return messageCard('Every bottle is hidden', 'Turn some back on to get picks.',
    `<button class="primary-btn" data-action="collection"><span>Manage collection</span></button>`);
}

function renderView() {
  document.querySelectorAll('[data-view]').forEach(b => b.setAttribute('aria-selected', String(b.dataset.view === state.view)));
  const view = $('#view');
  const banner = state.shared ? ui.sharedBannerHTML(state.shared, state.mine.records.length) : '';

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
    view.innerHTML = banner + emptyState();
    return;
  }

  if (state.view === 'today') {
    view.innerHTML = `${banner}<div class="slots">
      ${slotSection('day', state.today.day, `Top pick · ${state.wx.day.label.toLowerCase()}`)}
      ${slotSection('night', state.today.night, `Top pick · ${state.wx.night.label.toLowerCase()}`)}
    </div>`;
  } else {
    const occasion = occasionById(state.occasion) ?? occasionById('casual');
    const slot = state.occasionSlot ?? occasion.slot;
    const ranked = rankContext('occ', state.wx[slot], occasion);
    view.innerHTML = `${banner}
      ${ui.occasionPickerHTML(occasion.id)}
      <div class="occ-bar">${ui.slotToggleHTML(slot, state.wx)}</div>
      <div class="slots single">${slotSection('occ', ranked, `Best for ${occasion.label.toLowerCase()}`)}</div>`;
  }
}

function renderFooter() {
  if (!state.demo) return;
  const all = sourceRecords();
  const on = activeFragrances().length;
  const usesFragella = all.some(f => isFragellaId(f.id));
  const usesFragrantica = all.some(f => !isFragellaId(f.id));
  const sources = [
    usesFragrantica && `Fragrantica (synced ${ui.esc(state.demo.fetched)})`,
    usesFragella && '<a href="https://api.fragella.com" target="_blank" rel="noopener">Fragella</a>',
  ].filter(Boolean).join(' · ');
  const updated = state.wx
    ? `Weather ${state.wx.stale ? 'offline · ' : ''}updated ${new Date(state.wx.fetchedAt).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}`
    : '';
  $('#foot').innerHTML = `
    <span>${on} of ${all.length} bottles in rotation · <button class="link-btn" data-action="collection">Manage</button></span>
    ${sources ? `<span>Fragrance data: ${sources}</span>` : ''}
    <span>${updated} <button class="icon-btn small" data-action="refresh" aria-label="Refresh weather">${ui.icon.refresh}</button></span>
    <span class="muted">Forecast by <a href="https://open-meteo.com" target="_blank" rel="noopener">Open-Meteo</a></span>`;
}

function renderPicks() {
  computeToday();
  renderHero();
  renderView();
  renderFooter();
}

function render() {
  renderPicks();
  if (state.sheet) renderSheet();
}

// ---------- Sheets ----------

function renderSheet({ keepScroll = false } = {}) {
  const el = $('#sheet');
  const s = state.sheet;
  const scroll = keepScroll ? el.querySelector('.sheet-panel')?.scrollTop : 0;
  if (s.kind === 'detail') {
    const ctx = state.contexts[s.ctx];
    const entry = ctx?.entries.get(s.id);
    if (!entry) return closeSheet();
    const label = ctx.occasion ? `${ctx.occasion.label} · ${ctx.win.label.toLowerCase()}` : ctx.win.label;
    const worn = wornIn(state.history, ctx.win.dateISO, ctx.win.slot)?.id ?? null;
    el.innerHTML = ui.sheetHTML(entry, label, s.ctx, worn);
  } else if (s.kind === 'collection') {
    el.innerHTML = ui.collectionSheetHTML({
      tab: state.shared ? null : state.active,
      demo: state.demo?.fragrances ?? [],
      mine: state.mine,
      hidden: state.hidden,
      shared: state.shared,
    });
  } else if (s.kind === 'add') {
    el.innerHTML = ui.addSheetHTML(s, new Set(state.mine.records.map(r => r.id)));
  } else if (s.kind === 'import') {
    el.innerHTML = ui.importSheetHTML(s, MAX_IMPORT_LINES);
  } else {
    el.innerHTML = ui.locationSheetHTML(s);
  }
  if (keepScroll) el.querySelector('.sheet-panel').scrollTop = scroll;
}

function openSheet(sheet) {
  const wasOpen = !!state.sheet;
  const sameKind = state.sheet?.kind === sheet.kind;
  state.sheet = sheet;
  renderSheet({ keepScroll: sameKind });
  const el = $('#sheet');
  el.hidden = false;
  document.body.classList.add('sheet-open');
  if (!wasOpen) requestAnimationFrame(() => el.classList.add('open'));
  if (!sameKind) {
    const typing = ['add', 'import', 'location'].includes(sheet.kind);
    el.querySelector(typing ? 'input, textarea' : '.sheet-close')?.focus({ preventScroll: true });
  }
}

function updateSheet(patch) {
  if (!state.sheet) return;
  state.sheet = { ...state.sheet, ...patch };
  renderSheet({ keepScroll: true });
}

function closeSheet() {
  const el = $('#sheet');
  state.sheet = null;
  el.classList.remove('open');
  document.body.classList.remove('sheet-open');
  setTimeout(() => { if (!state.sheet) { el.hidden = true; el.innerHTML = ''; } }, 220);
}

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

// ---------- Finding bottles ----------

// Demo-catalog matches first (free, and they carry real vote data), then Fragella.
async function findBottles(query) {
  const local = localMatches(query, state.demo?.fragrances ?? []);
  if (!apiReady()) return { results: local, notice: local.length ? '' : 'Online search isn’t set up yet, so only the demo collection was searched.' };
  // Fragella sometimes lists one bottle twice; keep the first of each name + brand.
  const results = [...local];
  for (const r of await searchFragrances(query)) if (!results.some(x => sameBottle(x, r))) results.push(r);
  return { results, notice: '' };
}

async function runSearch(query) {
  updateSheet({ query, busy: true, error: '', notice: '' });
  try {
    const { results, notice } = await findBottles(query);
    updateSheet({ results, notice, busy: false });
  } catch (err) {
    const local = localMatches(query, state.demo?.fragrances ?? []);
    updateSheet({ results: local.length ? local : null, busy: false, error: err.message });
  }
}

async function runImport(text) {
  const lines = importLines(text);
  if (!lines.length) return updateSheet({ text, error: 'Paste at least one fragrance name.' });
  const rows = lines.map(line => ({ line, status: 'pending', match: null, checked: false }));
  updateSheet({ text, rows, busy: true, error: '' });
  let stopped = '';
  for (const row of rows) {
    const local = localMatches(row.line, state.demo?.fragrances ?? [], 1)[0];
    if (local) Object.assign(row, { match: local, checked: true, status: 'done' });
    else if (stopped || !apiReady()) Object.assign(row, { status: 'done', note: stopped || 'Online search isn’t set up yet.' });
    else {
      try {
        const [hit] = await searchFragrances(row.line);
        Object.assign(row, { match: hit ?? null, checked: Boolean(hit), status: 'done' });
      } catch (err) {
        stopped = err.message;
        Object.assign(row, { status: 'done', note: err.message });
      }
    }
    if (state.sheet?.kind !== 'import') return;
    updateSheet({ rows: [...rows] });
  }
  updateSheet({ busy: false });
}

async function share() {
  const records = activeFragrances();
  if (!records.length) return;
  const name = state.shared?.name ?? (state.active === 'mine' ? state.mine.name : 'David');
  const url = shareURL(records, name);
  try {
    if (navigator.share) {
      await navigator.share({ title: 'Scentcast', text: name ? `${name}’s fragrance picks` : 'Fragrance picks', url });
      return;
    }
    await navigator.clipboard.writeText(url);
    showToast('<span>Share link copied</span>');
  } catch (err) {
    if (err?.name !== 'AbortError') showToast(`<span>Copy this link: ${ui.esc(url)}</span>`);
  }
}

async function openSharedLink(link) {
  state.shared = { ...link, records: [], missing: [], loading: true, confirmReplace: false };
  const demoById = new Map((state.demo?.fragrances ?? []).map(f => [f.id, f]));
  const fromDemo = link.ids.map(id => demoById.get(id)).filter(Boolean);
  const remoteIds = link.ids.filter(isFragellaId);
  let fetched = { records: [], missing: remoteIds };
  if (remoteIds.length && apiReady()) {
    try { fetched = await fetchFragrances(remoteIds); } catch {}
  }
  if (!state.shared) return;
  const byId = new Map([...fromDemo, ...fetched.records].map(r => [r.id, r]));
  state.shared.records = link.ids.map(id => byId.get(id)).filter(Boolean);
  state.shared.missing = link.ids.filter(id => !byId.has(id));
  state.shared.loading = false;
  renderPicks();
}

// ---------- Weather ----------

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
    const id = d.toggleHidden;
    const hide = !state.hidden.has(id);
    if (hide) state.hidden.add(id);
    else state.hidden.delete(id);
    saveHidden(state.hidden);
    renderPicks();
    if (state.sheet?.kind === 'collection') {
      renderSheet({ keepScroll: true });
      $(`#sheet [data-toggle-hidden="${CSS.escape(id)}"]`)?.focus({ preventScroll: true });
    } else if (hide) {
      closeSheet();
      showToast(`<span>${ui.esc(findRecord(id)?.name ?? 'Bottle')} hidden from picks</span><button data-action="unhide" data-id="${ui.esc(id)}">Undo</button>`);
    }
  } else if (d.action === 'unhide') {
    state.hidden.delete(d.id);
    saveHidden(state.hidden);
    renderPicks();
    hideToast();
  } else if (d.remove) {
    const index = state.mine.records.findIndex(r => r.id === d.remove);
    if (index < 0) return;
    const [removed] = state.mine.records.splice(index, 1);
    saveMine(state.mine);
    renderPicks();
    renderSheet({ keepScroll: true });
    state.lastRemoved = { record: removed, index };
    showToast(`<span>${ui.esc(removed.name)} removed</span><button data-action="undo-remove">Undo</button>`);
  } else if (d.action === 'undo-remove' && state.lastRemoved) {
    const { record, index } = state.lastRemoved;
    state.mine.records.splice(index, 0, record);
    state.lastRemoved = null;
    saveMine(state.mine);
    render();
    hideToast();
  } else if (d.collectionTab) {
    setActive(d.collectionTab);
    renderPicks();
    if (state.sheet?.kind === 'collection') renderSheet();
  } else if (d.action === 'collection') {
    openSheet({ kind: 'collection' });
  } else if (d.action === 'add') {
    openSheet({ kind: 'add' });
  } else if (d.add !== undefined) {
    const record = state.sheet?.results?.[+d.add];
    if (!record) return;
    addToMine(record);
    renderPicks();
    renderSheet({ keepScroll: true });
    showToast(`<span>${ui.esc(record.name)} added to your collection</span>`);
  } else if (d.action === 'import') {
    openSheet({ kind: 'import', text: state.sheet?.kind === 'import' ? state.sheet.text : '' });
  } else if (d.importToggle !== undefined) {
    const rows = state.sheet.rows.map((r, i) => (i === +d.importToggle ? { ...r, checked: !r.checked } : r));
    updateSheet({ rows });
  } else if (d.action === 'import-confirm') {
    const picked = state.sheet.rows.filter(r => r.match && r.checked).map(r => r.match);
    picked.forEach(addToMine);
    renderPicks();
    openSheet({ kind: 'collection' });
    showToast(`<span>Added ${picked.length} bottle${picked.length === 1 ? '' : 's'}</span>`);
  } else if (d.action === 'share') {
    await share();
  } else if (d.action === 'shared-save') {
    const s = state.shared;
    if (!s || s.loading) return;
    if (state.mine.records.length && !s.confirmReplace) {
      s.confirmReplace = true;
      renderView();
      return;
    }
    state.mine = { name: state.mine.name, records: s.records };
    saveMine(state.mine);
    setActive('mine');
    renderPicks();
    showToast('<span>Saved as your collection</span>');
  } else if (d.action === 'shared-close') {
    closeShared();
    renderPicks();
  } else if (d.view) {
    state.view = d.view;
    savePrefs();
    renderView();
  } else if (d.close !== undefined) {
    closeSheet();
  } else if (d.wear !== undefined) {
    const ctx = state.contexts[d.ctx];
    state.history = toggleWear(d.id, ctx.win.dateISO, ctx.win.slot);
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
    openSheet({ kind: 'detail', ctx: d.ctx, id: d.id });
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
  const form = e.target.dataset.form;
  if (!form) return;
  e.preventDefault();
  const data = new FormData(e.target);
  if (form === 'city') {
    const query = data.get('q').trim();
    if (!query) return;
    try {
      openSheet({ kind: 'location', query, results: await searchCities(query) });
    } catch (err) {
      openSheet({ kind: 'location', query, error: err.message });
    }
  } else if (form === 'search') {
    const query = data.get('q').trim();
    if (query.length < 3) return updateSheet({ query, error: 'Type at least 3 letters.' });
    await runSearch(query);
  } else if (form === 'import') {
    await runImport(String(data.get('text') ?? ''));
  }
});

document.addEventListener('change', e => {
  if (e.target.dataset.field === 'mine-name') {
    state.mine.name = e.target.value.trim().slice(0, 40);
    saveMine(state.mine);
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
function locationFromURL(params) {
  const raw = params.get('loc');
  if (!raw) return null;
  const [lat, lon, ...name] = raw.split(',');
  if (!Number.isFinite(+lat) || !Number.isFinite(+lon)) return null;
  return { name: name.join(',').trim() || 'Pinned location', lat: +lat, lon: +lon };
}

async function boot() {
  const params = new URLSearchParams(location.search);
  const pinned = locationFromURL(params);
  if (pinned) state.loc = pinned;
  render();
  try {
    state.demo = await (await fetch('data/collection.json')).json();
    for (const f of state.demo.fragrances) f.id = String(f.id);
  } catch {
    $('#view').innerHTML = messageCard('Collection missing', 'Couldn’t load data/collection.json.');
    return;
  }
  const link = parseShare(params);
  if (link) openSharedLink(link);
  renderFooter();
  if (state.loc) await refreshWeather();
  else { render(); openSheet({ kind: 'location' }); }

  if ('serviceWorker' in navigator) navigator.serviceWorker.register('sw.js').catch(() => {});
}

boot();

// Which bottles the app ranks.
// - 'demo': David's Fragrantica wardrobe (data/collection.json).
// - 'mine': a list the viewer builds by searching. Full records are stored with
//   it, so it works offline and never spends another lookup.
// A share link (?c=id,id&n=Name) opens someone's list as a temporary view.
const MINE_KEY = 'scentcast.mine';
const ACTIVE_KEY = 'scentcast.active';
const MAX_SHARED = 80;
const MAX_IMPORT_LINES = 15;

export function loadMine() {
  try {
    const mine = JSON.parse(localStorage.getItem(MINE_KEY));
    return { name: mine?.name ?? '', records: mine?.records ?? [] };
  } catch {
    return { name: '', records: [] };
  }
}

export function saveMine(mine) {
  try { localStorage.setItem(MINE_KEY, JSON.stringify(mine)); } catch {}
}

export function loadActive() {
  try { return localStorage.getItem(ACTIVE_KEY) === 'mine' ? 'mine' : 'demo'; } catch { return 'demo'; }
}

export function saveActive(active) {
  try { localStorage.setItem(ACTIVE_KEY, active); } catch {}
}

export function shareURL(records, name) {
  // Built by hand so ids read cleanly (commas and colons unescaped).
  const ids = records.map(r => encodeURIComponent(r.id).replace(/%3A/gi, ':')).join(',');
  const suffix = name ? `&n=${encodeURIComponent(name)}` : '';
  return `${location.origin}${location.pathname}?c=${ids}${suffix}`;
}

export function parseShare(params) {
  const raw = params.get('c');
  if (!raw) return null;
  const ids = [...new Set(raw.split(',').map(s => s.trim()).filter(Boolean))].slice(0, MAX_SHARED);
  return ids.length ? { ids, name: params.get('n')?.trim().slice(0, 40) || null } : null;
}

const normalize = s => String(s).normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();

// Offline matches against a list of records, e.g. the demo catalog.
export function localMatches(query, records, limit = 5) {
  const words = normalize(query).split(' ').filter(w => w.length > 1);
  if (!words.length) return [];
  return records.filter(r => {
    const hay = normalize(`${r.name} ${r.brand}`);
    return words.every(w => hay.includes(w));
  }).slice(0, limit);
}

// Same bottle from two sources ("Sauvage · Dior" vs "Sauvage · Christian Dior").
export function sameBottle(a, b) {
  if (normalize(a.name) !== normalize(b.name)) return false;
  const [x, y] = [normalize(a.brand), normalize(b.brand)];
  return x.includes(y) || y.includes(x);
}

// "1. Dior Sauvage 100ml" -> "Dior Sauvage"
export function importLines(text) {
  return text.split(/\r?\n/)
    .map(l => l.replace(/^\s*(?:[-*•·]|\d+[.)])\s*/, '')
      .replace(/\b\d+(?:[.,]\d+)?\s?(?:ml|oz)\b/gi, '')
      .replace(/\s+(?:-|–|—|by)\s+/gi, ' ')
      .replace(/\s+/g, ' ')
      .trim())
    .filter(l => l.length >= 3)
    .slice(0, MAX_IMPORT_LINES);
}

export { MAX_IMPORT_LINES };

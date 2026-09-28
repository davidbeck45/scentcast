// Bottles taken out of rotation on this device (empty, lent out, not feeling it).
const KEY = 'scentcast.hidden';

export function loadHidden() {
  try { return new Set(JSON.parse(localStorage.getItem(KEY)) ?? []); } catch { return new Set(); }
}

export function saveHidden(hidden) {
  try { localStorage.setItem(KEY, JSON.stringify([...hidden])); } catch {}
}

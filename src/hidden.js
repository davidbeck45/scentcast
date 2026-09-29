// Bottles taken out of rotation on this device (empty, lent out, not feeling it).
const KEY = 'scentcast.hidden';

// Hidden until a device makes its own choice in Manage, so a first-time
// visitor (someone I send the link to) never sees these.
export const DEFAULT_HIDDEN = [
  '4310', // Jake (Hollister)
];

export function loadHidden() {
  try {
    const stored = localStorage.getItem(KEY);
    return new Set((stored === null ? DEFAULT_HIDDEN : JSON.parse(stored)).map(String));
  } catch {
    return new Set(DEFAULT_HIDDEN);
  }
}

export function saveHidden(hidden) {
  try { localStorage.setItem(KEY, JSON.stringify([...hidden])); } catch {}
}

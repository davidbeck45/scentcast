// Wear log: one entry per (date, slot), newest first. Feeds rotation.
const KEY = 'scentcast.history';
const MAX_ENTRIES = 120;

export function loadHistory() {
  try {
    return (JSON.parse(localStorage.getItem(KEY)) ?? []).map(h => ({ ...h, id: String(h.id) }));
  } catch {
    return [];
  }
}

function save(history) {
  try { localStorage.setItem(KEY, JSON.stringify(history.slice(0, MAX_ENTRIES))); } catch {}
}

export function wornIn(history, dateISO, slot) {
  return history.find(h => h.date === dateISO && h.slot === slot) ?? null;
}

// Toggle: logging the same bottle again for the same slot clears it.
export function toggleWear(id, dateISO, slot) {
  const history = loadHistory();
  const current = wornIn(history, dateISO, slot);
  const rest = history.filter(h => !(h.date === dateISO && h.slot === slot));
  const next = current?.id === id ? rest : [{ id, date: dateISO, slot }, ...rest];
  save(next);
  return next;
}

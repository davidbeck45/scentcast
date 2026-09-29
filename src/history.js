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

export function clearHistory() {
  save([]);
  return [];
}

const shiftISO = (iso, days) => new Date(Date.parse(`${iso}T12:00:00Z`) + days * 86_400_000).toISOString().slice(0, 10);

// Wear counts and last-worn dates for the journal. `days` is the look-back
// window for counts; last-worn dates cover the whole log.
export function journalStats(history, todayISO, days = 30) {
  const since = shiftISO(todayISO, -(days - 1));
  const counts = new Map();
  const lastWorn = new Map();
  let wears = 0;
  for (const h of history) {
    if (h.date > todayISO) continue;
    if (!lastWorn.has(h.id) || h.date > lastWorn.get(h.id)) lastWorn.set(h.id, h.date);
    if (h.date < since) continue;
    wears++;
    counts.set(h.id, (counts.get(h.id) ?? 0) + 1);
  }
  const top = [...counts].sort((a, b) => b[1] - a[1] || (lastWorn.get(b[0]) > lastWorn.get(a[0]) ? 1 : -1));
  return { wears, bottles: counts.size, top, lastWorn, since };
}

// The last `weeks` calendar weeks up to today, Sunday first:
// [[{ dateISO, day: entry|null, night: entry|null, future }...7], ...]
export function journalCalendar(history, todayISO, weeks = 5) {
  const weekday = new Date(`${todayISO}T12:00:00Z`).getUTCDay();
  const start = shiftISO(todayISO, -weekday - 7 * (weeks - 1));
  return Array.from({ length: weeks }, (_, w) => Array.from({ length: 7 }, (_, d) => {
    const dateISO = shiftISO(start, w * 7 + d);
    return {
      dateISO,
      future: dateISO > todayISO,
      day: wornIn(history, dateISO, 'day'),
      night: wornIn(history, dateISO, 'night'),
    };
  }));
}

export { shiftISO };

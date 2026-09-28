// Client for the Scentcast API (worker/): Fragella search behind a shared cache.
// DEPLOYED is the workers.dev URL printed by `npx wrangler deploy`.
const DEPLOYED = '';
const LOCAL = ['127.0.0.1', 'localhost'].includes(location.hostname);

export const API_BASE = LOCAL ? 'http://127.0.0.1:8787' : DEPLOYED;
export const apiReady = () => Boolean(API_BASE);

async function call(path) {
  if (!API_BASE) throw new Error('Online search isn’t set up yet.');
  let res;
  try {
    res = await fetch(API_BASE + path);
  } catch {
    throw new Error('Can’t reach fragrance search. Check your connection.');
  }
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw Object.assign(new Error(body.message || `Search failed (${res.status}).`), { code: body.error });
  return body;
}

export const searchFragrances = query => call(`/search?q=${encodeURIComponent(query)}`).then(b => b.results);

export const fetchFragrances = ids => (ids.length
  ? call(`/fragrances?ids=${ids.map(encodeURIComponent).join(',')}`)
  : Promise.resolve({ records: [], missing: [] }));

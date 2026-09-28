const KEY = 'scentcast.location';

export function loadLocation() {
  try { return JSON.parse(localStorage.getItem(KEY)); } catch { return null; }
}

export function saveLocation(loc) {
  try { localStorage.setItem(KEY, JSON.stringify(loc)); } catch {}
}

export function deviceLocation() {
  return new Promise((resolve, reject) => {
    if (!navigator.geolocation) return reject(new Error('This browser can’t share location.'));
    navigator.geolocation.getCurrentPosition(
      p => resolve({ name: 'My location', lat: +p.coords.latitude.toFixed(3), lon: +p.coords.longitude.toFixed(3), device: true }),
      e => reject(new Error(e.code === 1 ? 'Location permission was denied.' : 'Couldn’t get your location.')),
      { timeout: 10_000, maximumAge: 30 * 60 * 1000 },
    );
  });
}

export async function searchCities(query) {
  const params = new URLSearchParams({ name: query, count: 6, language: 'en', format: 'json' });
  const res = await fetch(`https://geocoding-api.open-meteo.com/v1/search?${params}`);
  if (!res.ok) throw new Error('City search failed.');
  const data = await res.json();
  return (data.results ?? []).map(r => ({
    name: r.name,
    region: [r.admin1, r.country_code].filter(Boolean).join(', '),
    lat: r.latitude,
    lon: r.longitude,
  }));
}

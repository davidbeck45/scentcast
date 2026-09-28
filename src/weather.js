// Open-Meteo forecast (free, no key) summarized into "now", a daytime window
// and a night window. Open-Meteo returns wall-clock times for the location
// ("2026-09-28T13:00"); we parse them as UTC and shift "now" by the
// location's UTC offset so all comparisons happen in the location's time.
import { describe, SEVERITY } from './wmo.js';

const FORECAST_URL = 'https://api.open-meteo.com/v1/forecast';
export const WINDOWS = { day: [10, 17], night: [19, 23] };

const CACHE_KEY = 'scentcast.weather';
const CACHE_MAX_AGE = 20 * 60 * 1000;

const wallMs = iso => Date.parse(`${iso}Z`);
const avg = xs => xs.reduce((a, b) => a + b, 0) / xs.length;
const clamp = (x, lo, hi) => Math.min(hi, Math.max(lo, x));

export async function fetchForecast({ lat, lon }) {
  const params = new URLSearchParams({
    latitude: lat,
    longitude: lon,
    current: 'temperature_2m,apparent_temperature,relative_humidity_2m,weather_code,cloud_cover,is_day',
    hourly: 'temperature_2m,apparent_temperature,relative_humidity_2m,weather_code,precipitation_probability',
    daily: 'sunrise,sunset,temperature_2m_max,temperature_2m_min',
    temperature_unit: 'fahrenheit',
    timezone: 'auto',
    forecast_days: 3,
  });
  const res = await fetch(`${FORECAST_URL}?${params}`);
  if (!res.ok) throw new Error(`Weather request failed (${res.status})`);
  return { ...(await res.json()), fetchedAt: Date.now() };
}

// Cached fetch: fresh cache wins, network next, stale cache if offline.
export async function getForecast(loc) {
  const key = `${loc.lat},${loc.lon}`;
  let cached = null;
  try { cached = JSON.parse(localStorage.getItem(CACHE_KEY)); } catch {}
  if (cached?.key === key && Date.now() - cached.forecast.fetchedAt < CACHE_MAX_AGE) return cached.forecast;
  try {
    const forecast = await fetchForecast(loc);
    try { localStorage.setItem(CACHE_KEY, JSON.stringify({ key, forecast })); } catch {}
    return forecast;
  } catch (err) {
    if (cached?.key === key) return { ...cached.forecast, stale: true };
    throw err;
  }
}

function headline(hours) {
  const counts = {};
  for (const h of hours) {
    const c = describe(h.code).category;
    counts[c] = (counts[c] ?? 0) + 1;
  }
  const needed = Math.min(2, hours.length);
  const severe = [...SEVERITY].reverse().find(c => (counts[c] ?? 0) >= needed && SEVERITY.indexOf(c) >= 3);
  const category = severe ?? Object.entries(counts).sort((a, b) => b[1] - a[1])[0][0];
  const codeCounts = {};
  for (const h of hours) if (describe(h.code).category === category) codeCounts[h.code] = (codeCounts[h.code] ?? 0) + 1;
  const code = +Object.entries(codeCounts).sort((a, b) => b[1] - a[1])[0][0];
  return describe(code);
}

export function phaseAt(now, sunrise, sunset) {
  const m = 60_000;
  if (now < sunrise - 40 * m) return 'night';
  if (now < sunrise + 50 * m) return 'dawn';
  if (now < sunset - 50 * m) return 'day';
  if (now < sunset + 40 * m) return 'dusk';
  return 'night';
}

export function summarize(forecast, nowMs = Date.now()) {
  const wallNow = nowMs + forecast.utc_offset_seconds * 1000;
  const nowDate = new Date(wallNow);
  const todayISO = nowDate.toISOString().slice(0, 10);
  const hour = nowDate.getUTCHours();
  const tomorrowISO = new Date(wallNow + 86_400_000).toISOString().slice(0, 10);

  const h = forecast.hourly;
  const hours = h.time.map((t, i) => ({
    date: t.slice(0, 10),
    hour: +t.slice(11, 13),
    temp: h.temperature_2m[i],
    feels: h.apparent_temperature[i],
    humidity: h.relative_humidity_2m[i],
    code: h.weather_code[i],
    pop: h.precipitation_probability[i] ?? 0,
  }));

  const slotWindow = slot => {
    const [start, end] = WINDOWS[slot];
    const today = hour < end;
    const dateISO = today ? todayISO : tomorrowISO;
    const from = today ? Math.max(start, hour) : start;
    const span = hours.filter(x => x.date === dateISO && x.hour >= from && x.hour <= end);
    const cond = headline(span);
    return {
      slot,
      label: slot === 'day' ? (today ? 'Today' : 'Tomorrow') : (today ? 'Tonight' : 'Tomorrow night'),
      dateISO,
      date: new Date(`${dateISO}T12:00:00`),
      lat: forecast.latitude,
      feelsF: avg(span.map(x => x.feels)),
      hiF: Math.max(...span.map(x => x.temp)),
      loF: Math.min(...span.map(x => x.temp)),
      humidity: avg(span.map(x => x.humidity)),
      pop: Math.max(...span.map(x => x.pop)),
      code: cond.code,
      condition: cond.label,
      category: cond.category,
    };
  };

  const d = forecast.daily;
  const di = Math.max(0, d.time.indexOf(todayISO));
  const sunrise = wallMs(d.sunrise[di]);
  const sunset = wallMs(d.sunset[di]);
  const c = forecast.current;

  return {
    todayISO,
    stale: !!forecast.stale,
    fetchedAt: forecast.fetchedAt,
    now: {
      tempF: c.temperature_2m,
      feelsF: c.apparent_temperature,
      humidity: c.relative_humidity_2m,
      cloudCover: c.cloud_cover,
      hiF: d.temperature_2m_max[di],
      loF: d.temperature_2m_min[di],
      phase: phaseAt(wallNow, sunrise, sunset),
      sunProgress: clamp((wallNow - sunrise) / (sunset - sunrise), 0, 1),
      ...describe(c.weather_code),
    },
    day: slotWindow('day'),
    night: slotWindow('night'),
  };
}

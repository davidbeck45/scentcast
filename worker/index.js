// Scentcast API: a thin Cloudflare Worker in front of Fragella.
// - Keeps the Fragella key server-side.
// - Caches each bottle it looks up (and each search) in KV, so a bottle costs
//   one upstream request and is then free for everyone. Entries expire after
//   30 days to stay within Fragella's terms on storing data.
// - Caps upstream lookups per IP per day so one visitor can't drain the quota.
//
// GET /search?q=sauvage        -> { results: [record], cached }
// GET /fragrances?ids=fg:a,... -> { records: [record], missing: [id] }
import { fromFragella, isFragellaId, fragellaSlug } from '../src/fragella.js';

const DEFAULT_BASE = 'https://api.fragella.com/api/v1';
const RECORD_TTL = 30 * 86400;
const QUERY_TTL = 14 * 86400;
const SEARCH_LIMIT = 8;
const MAX_IDS = 80;
const MAX_UPSTREAM_PER_CALL = 10;

class ApiError extends Error {
  constructor(status, code, message) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

export const normalizeQuery = q => String(q ?? '').toLowerCase().replace(/[^\p{L}\p{N}' ]+/gu, ' ').replace(/\s+/g, ' ').trim();

function corsHeaders(origin, env) {
  const allowed = String(env.ALLOWED_ORIGINS ?? '').split(',').map(s => s.trim()).filter(Boolean);
  const headers = { Vary: 'Origin', 'Access-Control-Allow-Methods': 'GET, OPTIONS', 'Access-Control-Max-Age': '86400' };
  if (origin && allowed.includes(origin)) headers['Access-Control-Allow-Origin'] = origin;
  return headers;
}

function json(body, status, cors) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store', ...cors },
  });
}

async function spendLookup(request, env) {
  const ip = request.headers.get('CF-Connecting-IP') ?? 'local';
  const key = `rl:${new Date().toISOString().slice(0, 10)}:${ip}`;
  const used = Number(await env.CACHE.get(key)) || 0;
  if (used >= (Number(env.DAILY_LOOKUPS_PER_IP) || 15)) {
    throw new ApiError(429, 'rate_limited', 'Daily lookup limit reached. Bottles already found still work; try new ones tomorrow.');
  }
  await env.CACHE.put(key, String(used + 1), { expirationTtl: 2 * 86400 });
}

async function upstream(env, path) {
  const res = await fetch(`${env.FRAGELLA_BASE || DEFAULT_BASE}${path}`, { headers: { 'x-api-key': env.FRAGELLA_KEY } });
  if (res.status === 404) return null;
  if (res.status === 429) throw new ApiError(429, 'quota', 'This month’s lookup budget is used up. Bottles already found still work.');
  if (!res.ok) throw new ApiError(502, 'upstream', `Fragrance lookup failed (${res.status}).`);
  return res.json();
}

const readRecords = (env, ids) => Promise.all(ids.map(id => env.CACHE.get(`f:${id}`, 'json')));
const writeRecord = (env, record) => env.CACHE.put(`f:${record.id}`, JSON.stringify(record), { expirationTtl: RECORD_TTL });

async function search(url, request, env) {
  const q = normalizeQuery(url.searchParams.get('q'));
  if (q.length < 3) throw new ApiError(400, 'bad_query', 'Type at least 3 letters.');

  const cachedIds = await env.CACHE.get(`q:${q}`, 'json');
  if (cachedIds) {
    const records = await readRecords(env, cachedIds);
    if (records.every(Boolean)) return { results: records, cached: true };
  }

  await spendLookup(request, env);
  const data = await upstream(env, `/fragrances?${new URLSearchParams({ search: q, limit: String(SEARCH_LIMIT) })}`);
  const list = data === null ? [] : Array.isArray(data) ? data : (data.data ?? []);
  const records = list.filter(x => x?._id).map(fromFragella);
  await Promise.all(records.map(r => writeRecord(env, r)));
  await env.CACHE.put(`q:${q}`, JSON.stringify(records.map(r => r.id)), { expirationTtl: QUERY_TTL });
  return { results: records, cached: false };
}

async function byIds(url, request, env) {
  const ids = [...new Set(String(url.searchParams.get('ids') ?? '').split(',').map(s => s.trim()).filter(isFragellaId))].slice(0, MAX_IDS);
  const cached = await readRecords(env, ids);
  const found = new Map(cached.filter(Boolean).map(r => [r.id, r]));

  for (const id of ids.filter(id => !found.has(id)).slice(0, MAX_UPSTREAM_PER_CALL)) {
    await spendLookup(request, env);
    const data = await upstream(env, `/fragrances/${encodeURIComponent(fragellaSlug(id))}`);
    const raw = Array.isArray(data) ? data[0] : data;
    if (!raw?._id) continue;
    const record = { ...fromFragella(raw), id };
    await writeRecord(env, record);
    found.set(id, record);
  }

  return { records: ids.map(id => found.get(id)).filter(Boolean), missing: ids.filter(id => !found.has(id)) };
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const cors = corsHeaders(request.headers.get('Origin'), env);
    if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors });
    if (request.method !== 'GET') return json({ error: 'method', message: 'GET only.' }, 405, cors);
    try {
      if (url.pathname === '/search') return json(await search(url, request, env), 200, cors);
      if (url.pathname === '/fragrances') return json(await byIds(url, request, env), 200, cors);
      if (url.pathname === '/') return json({ ok: true, service: 'scentcast-api' }, 200, cors);
      return json({ error: 'not_found', message: 'Unknown route.' }, 404, cors);
    } catch (err) {
      if (err instanceof ApiError) return json({ error: err.code, message: err.message }, err.status, cors);
      return json({ error: 'server', message: 'Something went wrong.' }, 500, cors);
    }
  },
};

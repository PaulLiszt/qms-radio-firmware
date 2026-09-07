// dmrdb.js — 客户端呼号数据库（DMR ID → 呼号）
// 设计原则（减少服务器负载、且注册/监视不依赖 RadioID 网络）：
//   1) 优先由浏览器直接从「三方公开库」下载完整用户库（RadioID 等），缓存到 IndexedDB；
//   2) 打开页面先同步加载本地缓存立即可用（即使过期也算「缓存」），随后在后台静默刷新；
//   3) 自动刷新连续 10 次失败且本地无任何缓存时，才标记「同步失败，请手动更新」；
//   4) 「手动更新」按钮常驻：每次点击先试三方，三方失败则改从服务器镜像下载；
//      已更新成功时点击仍按「三方优先」逻辑正常刷新，不强制走服务器。
//   5) 本地缓存有效期 2 小时，过期后下次打开仍先显示缓存再后台刷新。
// 服务器镜像（data/dmr_users_cache.json）仅含 [DMR ID, 呼号] 两列，体积小。

import { codeFromName } from './countries.js';
import { lookupCallsign } from './prefixes.js';

const DB_NAME = 'mmdvm-s3';
const STORE = 'kv';
const KEY = 'dmrdb';
const REFRESH_MS = 2 * 3600 * 1000;
const AUTO_MAX = 10;        // 自动下载失败上限（仅当完全没有本地缓存时计入）
const RETRY_DELAY = 3000;   // 自动重试间隔(ms)

// 三方公开库（可在此增删你信任的镜像；首个可用即止）
const THIRD_PARTY = [
  'https://radioid.net/static/dmr/users.json',
  'https://database.radioid.net/static/users.json',
  'https://api.radioid.net/api/dmr/user/',
];
const SERVER_FALLBACK = '/api/dmrdb';

let map = null;       // Map<id, { c:callsign, n:name, cc:countryCode }>
let loading = null;   // 自动加载 Promise，避免并发重复拉取

// ---------- 状态机（供监视页渲染按钮/提示） ----------
// state: 'idle' | 'loading' | 'cached' | 'ok' | 'auto_failed' | 'manual_failed'
//   cached  = 已用本地缓存（可能已过期），后台刷新进行中或刷新失败但缓存可用
//   ok      = 已从网络/服务器成功刷新
let state = 'idle';
let autoFails = 0;
let usingCache = false;
const listeners = new Set();

function setStatus(s) {
  state = s;
  for (const cb of listeners) { try { cb(getStatus()); } catch (_) {} }
}
export function getStatus() { return { state, autoFails, usingCache, size: map ? map.size : 0 }; }
export function onStatus(cb) { listeners.add(cb); cb(getStatus()); return () => listeners.delete(cb); }

function delay(ms) { return new Promise(r => setTimeout(r, ms)); }

// ---------- IndexedDB ----------
function openIdb() {
  return new Promise((resolve, reject) => {
    const r = indexedDB.open(DB_NAME, 1);
    r.onupgradeneeded = () => { if (!r.result.objectStoreNames.contains(STORE)) r.result.createObjectStore(STORE); };
    r.onsuccess = () => resolve(r.result);
    r.onerror = () => reject(r.error);
  });
}
async function idbGet(k) {
  const db = await openIdb();
  return new Promise((resolve) => {
    const tx = db.transaction(STORE, 'readonly');
    const rq = tx.objectStore(STORE).get(k);
    rq.onsuccess = () => resolve(rq.result);
    rq.onerror = () => resolve(null);
  });
}
async function idbSet(k, v) {
  const db = await openIdb();
  return new Promise((resolve) => {
    const tx = db.transaction(STORE, 'readwrite');
    tx.objectStore(STORE).put(v, k);
    tx.oncomplete = () => resolve();
    tx.onerror = () => resolve();
  });
}

// ---------- 归一化 ----------
// 支持多种上游格式，统一为 Map<id, {c:呼号, n:姓名, cc:ISO码或国家名原文}>
// 注意：RadioID 的 users.json 只有 country（英文国名）而**没有** countryCode，
// 这是先前国旗显示不出来的根因。这里原样存入 cc，由 lookup() 统一解析成 ISO 码。
function normalize(raw) {
  const m = new Map();
  if (!raw) return m;
  // 我方服务器紧凑格式 { v, ts, rows:[[id, callsign], ...] }（精简：仅两列）
  if (Array.isArray(raw.rows)) {
    for (const r of raw.rows) m.set(String(r[0]), { c: r[1] || null, n: null, cc: null });
    return m;
  }
  // 已经是 Map 形态：id -> [c,n,cc] 或 id -> {c,n,cc,...}
  if (typeof raw === 'object' && !Array.isArray(raw) && !raw.users) {
    for (const [k, v] of Object.entries(raw)) {
      if (Array.isArray(v)) m.set(String(k), { c: v[0] || null, n: v[1] || null, cc: v[2] || null });
      else if (v && typeof v === 'object') m.set(String(k), { c: v.c || v.callsign || null, n: v.n || v.name || null, cc: v.cc || v.countryCode || v.country || null });
    }
    return m;
  }
  // RadioID 原始：{ users:[{ id/radio_id, callsign, fname, surname, country, ... }] }
  const arr = Array.isArray(raw) ? raw : (Array.isArray(raw.users) ? raw.users : []);
  for (const u of arr) {
    const id = u.radio_id || u.id || u.DMRID;
    if (!id) continue;
    const name = [u.fname || u.first_name, u.surname || u.last_name].filter(Boolean).join(' ').trim() || u.name || null;
    m.set(String(id), { c: u.callsign || null, n: name || null, cc: u.countryCode || u.country || null });
  }
  return m;
}

async function storeFromResp(resp) {
  const ct = resp.headers.get('content-type') || '';
  const raw = ct.includes('json') ? await resp.json() : JSON.parse(await resp.text());
  const m = normalize(raw);
  if (m.size === 0) throw new Error('空数据库');
  await idbSet(KEY, { ts: Date.now(), map: m });
  map = m;
}

// ---------- 下载尝试 ----------
async function fetchRaw(url, cors) {
  const r = await fetch(url, cors ? { mode: 'cors' } : {});
  if (!r.ok) return null;
  return r;
}
async function tryThirdParty() {
  for (const url of THIRD_PARTY) {
    try {
      const resp = await fetchRaw(url, true);
      if (resp) { await storeFromResp(resp); return true; }
    } catch (_) {}
  }
  return false;
}
async function tryServer() {
  try {
    const resp = await fetchRaw(SERVER_FALLBACK, false);
    if (resp) { await storeFromResp(resp); return true; }
  } catch (_) {}
  return false;
}
// 单次刷新：先三方，三方失败再服务器
async function doFetch() {
  if (await tryThirdParty()) return true;
  if (await tryServer()) return true;
  return false;
}

// ---------- 对外 API ----------
// 打开页面自动调用：
//  - 先同步加载本地缓存（若有）立即可用，解析不阻塞；
//  - 缓存未过期：直接以「缓存」状态呈现，并在后台静默刷新（不影响使用）；
//  - 无缓存/已过期/强制：前台刷新，连续 AUTO_MAX 次失败且仍无缓存才标记 auto_failed。
export async function ensureLoaded(force = false) {
  if (loading) return loading;
  loading = (async () => {
    const cached = await idbGet(KEY);
    const hasCache = !!(cached && cached.map);
    if (hasCache) { map = cached.map; usingCache = true; }   // 缓存立即可用

    const fresh = hasCache && !force && (Date.now() - cached.ts < REFRESH_MS);
    if (fresh) {
      setStatus('cached');                  // 显示缓存，后台刷新
      const ok = await doFetch();          // 静默刷新，不阻塞
      if (ok) { usingCache = false; setStatus('ok'); }
      return;                               // 刷新失败也保留缓存状态（不影响使用）
    }

    // 无缓存 / 已过期 / 强制刷新：前台刷新
    setStatus(hasCache ? 'cached' : 'loading');
    autoFails = 0;
    while (autoFails < AUTO_MAX) {
      const ok = await doFetch();
      if (ok) { usingCache = false; setStatus('ok'); return; }
      autoFails++;
      if (autoFails < AUTO_MAX) await delay(RETRY_DELAY);
    }
    // 全部失败：有缓存则继续用缓存，否则提示手动
    setStatus(hasCache ? 'cached' : 'auto_failed');
  })();
  return loading;
}

// 手动更新按钮（常驻可见）：
//  - 每次点击都「先三方、三方失败再服务器」；
//  - 已成功更新后点击仍按此逻辑正常刷新，不会强制走服务器；
//  - 仅在本次点击中三方与服务器均失败才标记 manual_failed。
export async function manualUpdate() {
  setStatus(usingCache ? 'cached' : 'loading');
  const ok1 = await tryThirdParty();
  if (ok1) { usingCache = false; autoFails = 0; setStatus('ok'); return true; }
  const ok2 = await tryServer();
  if (ok2) { usingCache = false; autoFails = 0; setStatus('ok'); return true; }
  setStatus('manual_failed');
  return false;
}

// 查询：返回 { id, callsign, name, countryCode, countryText }
// countryCode 解析优先级：库里的 ISO 码 → 库里国家名反查 → 呼号前缀推断（离线兜底）
export function lookup(id) {
  if (!map || id == null) return null;
  const e = map.get(String(id));
  if (!e) return null;

  let cc = null;
  let text = null;
  if (e.cc) {
    cc = codeFromName(e.cc);            // 兼容「US」与「United States」两种写法
    if (!cc) text = String(e.cc);       // 无法识别时保留原文，界面显示文字
  }
  if (!cc && e.c) {
    const p = lookupCallsign(e.c);      // 由呼号前缀推断（如 BA4QMS → CN）
    if (p) cc = p.code;
  }
  return { id: String(id), callsign: e.c, name: e.n, countryCode: cc, countryText: text };
}

export function isLoaded() { return !!map; }
export function size() { return map ? map.size : 0; }

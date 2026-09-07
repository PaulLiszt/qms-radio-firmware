// tz.js — 时区自动判定 + 统一时间格式化
// 判定优先级（全部在用户浏览器完成，不增加我方服务器负载）：
//   1) 用户手动指定（localStorage.mmdvm_tz_manual）
//   2) 由 IP 判定的时区（三方 API，结果缓存 24h）
//   3) 浏览器/系统时区（Intl，永远可用的兜底）
// 说明：先用 (3) 立即可用，再异步用 (2) 校正，避免首屏等待网络。

import { locale } from './i18n.js';

const CACHE_KEY = 'mmdvm_tz_ip';
const MANUAL_KEY = 'mmdvm_tz_manual';
const CACHE_MS = 24 * 3600 * 1000;

// 三方 IP → 时区服务（首个成功即止；失败静默）
const IP_TZ_SOURCES = [
  { url: 'https://ipapi.co/json/', pick: (j) => j && j.timezone },
  { url: 'https://worldtimeapi.org/api/ip', pick: (j) => j && j.timezone },
  { url: 'https://ipwho.is/', pick: (j) => j && j.timezone && (j.timezone.id || j.timezone) },
];

const browserTz = (() => {
  try { return Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC'; }
  catch (_) { return 'UTC'; }
})();

let tz = browserTz;
let source = 'browser';
const listeners = new Set();

function readManual() { try { return localStorage.getItem(MANUAL_KEY) || null; } catch (_) { return null; } }

function applyTz(v, src) {
  if (!v || v === tz) return;
  tz = v; source = src;
  listeners.forEach(cb => { try { cb(tz); } catch (_) {} });
}

// 时区变化订阅（IP 校正到达后各页面可刷新已渲染的时间）
export function onTzChange(cb) { listeners.add(cb); return () => listeners.delete(cb); }

export function tzName() { return tz; }
export function tzSource() { return source; }

export function setManualTz(v) {
  try { v ? localStorage.setItem(MANUAL_KEY, v) : localStorage.removeItem(MANUAL_KEY); } catch (_) {}
  applyTz(v || browserTz, v ? 'manual' : 'browser');
}

// 启动时调用一次：立即返回可用时区，并在后台按 IP 校正
export async function initTz() {
  const manual = readManual();
  if (manual) { applyTz(manual, 'manual'); return tz; }

  try {
    const c = JSON.parse(localStorage.getItem(CACHE_KEY) || 'null');
    if (c && c.tz && Date.now() - c.ts < CACHE_MS) { applyTz(c.tz, 'ip-cache'); return tz; }
  } catch (_) {}

  // 后台校正，不阻塞首屏
  (async () => {
    for (const s of IP_TZ_SOURCES) {
      try {
        const r = await fetch(s.url, { signal: AbortSignal.timeout(5000) });
        if (!r.ok) continue;
        const ct = r.headers.get('content-type') || '';
        if (!ct.includes('json')) continue;
        const v = s.pick(await r.json());
        if (typeof v === 'string' && v.includes('/')) {
          try { localStorage.setItem(CACHE_KEY, JSON.stringify({ tz: v, ts: Date.now() })); } catch (_) {}
          applyTz(v, 'ip');
          return;
        }
      } catch (_) { /* 尝试下一个源 */ }
    }
  })();

  return tz;
}

// ---------- 格式化 ----------
function fmt(ts, opts) {
  try { return new Intl.DateTimeFormat(locale(), Object.assign({ timeZone: tz }, opts)).format(new Date(ts)); }
  catch (_) { return new Date(ts).toLocaleString(); }
}

export function fmtDate(ts) { return fmt(ts, { year: 'numeric', month: '2-digit', day: '2-digit' }); }
export function fmtTime(ts) { return fmt(ts, { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false }); }
export function fmtDateTime(ts) {
  return fmt(ts, {
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false,
  });
}

// CSV / 文件名用：固定 YYYY-MM-DD HH:MM:SS（按当前时区换算，与语言无关）
export function fmtIso(ts) {
  try {
    const p = new Intl.DateTimeFormat('en-CA', {
      timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit',
      hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false,
    }).formatToParts(new Date(ts)).reduce((a, x) => (a[x.type] = x.value, a), {});
    return `${p.year}-${p.month}-${p.day} ${p.hour}:${p.minute}:${p.second}`;
  } catch (_) {
    return new Date(ts).toISOString().replace('T', ' ').slice(0, 19);
  }
}

// 文件名用：YYYYMMDD_HHMM
export function fmtStamp(ts) {
  const s = fmtIso(ts); // 2026-08-26 14:56:26
  return s.slice(0, 10).replace(/-/g, '') + '_' + s.slice(11, 16).replace(':', '');
}

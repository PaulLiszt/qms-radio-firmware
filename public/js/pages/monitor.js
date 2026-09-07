// pages/monitor.js — 监视/通话：开发板状态 + RX/TX 徽标 + 远端大卡(本地库解析) + 通联记录(CSV) + 实时日志
import { core } from '../core.js';
import { flagImg } from '../flags.js';
import { nameFromCode } from '../countries.js';
import * as dmrdb from '../dmrdb.js';
import { t } from '../i18n.js';
import * as tz from '../tz.js';

const QSO_KEY = 'mmdvm_qso';

function countryText(code, text) {
  if (code) { const n = nameFromCode(code); if (n) return n; }
  return text || '';
}
function csvCell(v) {
  const s = String(v == null ? '' : v);
  return /[",\r\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
}

export async function renderMonitor(view) {
  view.innerHTML = `
    <section class="card">
      <h2>${t('mon.stTitle')}</h2>
      <div class="grid4" id="stGrid">
        <div class="kv"><span class="k">${t('mon.k.wifi')}</span><b id="s_wifi">-</b></div>
        <div class="kv"><span class="k">${t('mon.k.bm')}</span><b id="s_bm">-</b></div>
        <div class="kv"><span class="k">${t('mon.k.vol')}</span><b id="s_vol">-</b></div>
        <div class="kv"><span class="k">${t('mon.k.tg')}</span><b id="s_tg">-</b></div>
        <div class="kv"><span class="k">${t('mon.k.src')}</span><b id="s_src">-</b></div>
        <div class="kv"><span class="k">${t('mon.k.rg')}</span><b id="s_rg">-</b></div>
      </div>
      <div class="row" style="margin-top:12px">
        <span id="mRx" class="badge idle">${t('mon.rxIdle')}</span>
        <span id="mTx" class="badge idle">${t('mon.txIdle')}</span>
      </div>
    </section>

    <section class="card">
      <h2>${t('mon.remoteTitle')} <span class="dbstat" id="dbStat">${t('mon.db.loading')}</span>
        <button id="dbUpdate" class="ghost" style="margin-left:8px">${t('mon.db.update')}</button>
      </h2>
      <div class="remote-card">
        <div id="remoteBody" class="rc-empty">${t('mon.remoteNone')}</div>
      </div>
    </section>

    <section class="card">
      <div class="row" style="align-items:baseline">
        <h2 style="margin:0">${t('mon.qsoTitle')}</h2>
        <button id="qsoExport" class="ghost">${t('mon.qsoExport')}</button>
        <button id="qsoClear" class="ghost">${t('mon.qsoClear')}</button>
      </div>
      <p class="sub">${t('mon.qsoSub')}</p>
      <div class="table-wrap">
        <table class="qso-table">
          <thead><tr>
            <th>${t('mon.th.time')}</th><th>${t('mon.th.dir')}</th><th>${t('mon.th.cs')}</th>
            <th>${t('mon.th.id')}</th><th>${t('mon.th.country')}</th><th>${t('mon.th.tg')}</th>
          </tr></thead>
          <tbody id="qsoBody"><tr><td colspan="6" class="muted">${t('mon.qsoEmpty')}</td></tr></tbody>
        </table>
      </div>
    </section>

    <section class="card">
      <h2>${t('mon.logTitle')}</h2>
      <div class="row">
        <button id="mClear" class="ghost">${t('mon.clearLog')}</button>
        <button id="mCopy" class="ghost">${t('mon.copyLog')}</button>
        <span class="hint">${t('mon.logHint')}</span>
      </div>
      <pre id="mLog" class="log" style="height:300px"></pre>
    </section>`;

  const logEl = view.querySelector('#mLog');
  const G = (id) => view.querySelector(id);
  const setBadge = (el, text, cls) => { el.textContent = text; el.classList.remove('idle', 'active'); el.classList.add(cls); };
  const append = (line) => { logEl.textContent += line + '\n'; logEl.scrollTop = logEl.scrollHeight; };

  // ---------- 呼号库状态（订阅 dmrdb 状态机） ----------
  let dbBusy = false;   // 手动更新进行中，按钮保持禁用
  function renderDbStat(s) {
    const el = G('#dbStat');
    if (!el) return;
    const upd = G('#dbUpdate');
    if (upd) upd.disabled = dbBusy;   // 手动更新时禁用，其余状态常驻可用
    switch (s.state) {
      case 'ok':
        el.textContent = t('mon.db.ok', { n: s.size }); el.className = 'dbstat ok';
        break;
      case 'cached':
        el.textContent = t('mon.db.cached', { n: s.size }); el.className = 'dbstat';
        break;
      case 'loading':
        el.textContent = t('mon.db.loading'); el.className = 'dbstat';
        break;
      case 'auto_failed':
        el.textContent = t('mon.db.autoFail'); el.className = 'dbstat warn';
        break;
      case 'manual_failed':
        el.textContent = t('mon.db.manualFail'); el.className = 'dbstat warn';
        break;
      default:
        el.textContent = t('mon.db.loading'); el.className = 'dbstat';
    }
  }
  dmrdb.onStatus(renderDbStat);
  G('#dbUpdate') && G('#dbUpdate').addEventListener('click', async () => {
    const b = G('#dbUpdate'); if (!b || b.disabled) return;
    dbBusy = true; if (b) b.disabled = true;
    try { await dmrdb.manualUpdate(); } finally { dbBusy = false; if (b) b.disabled = false; }
  });
  dmrdb.ensureLoaded().then(() => { renderQso(); });

  // ---------- 远端电台大卡（本地库解析，零服务器负载） ----------
  let currentTg = null;
  let remoteSrc = null;      // 当前远端 DMR ID
  let remoteTs = 0;          // 最近一次 RX 事件时间戳（RX 停止后冻结，不随 @@ST 每秒走时）
  let remoteInfo = null;     // 解析到的呼号信息
  let lastRenderedTg = null;

  function renderRemote() {
    const body = G('#remoteBody');
    body.className = 'rc-body';
    if (!remoteInfo) { body.innerHTML = `<div class="rc-empty">${t('mon.remoteUnknown')} (DMR ${remoteSrc})</div>`; return; }
    const cs = remoteInfo.callsign || t('common.unknown');
    const cty = countryText(remoteInfo.countryCode, remoteInfo.countryText);
    const flag = remoteInfo.countryCode ? flagImg(remoteInfo.countryCode) : '';
    const tsText = remoteTs ? tz.fmtDateTime(remoteTs) : '-';
    body.innerHTML = `
      <div class="rc-call">${flag}<span>${cs}</span></div>
      <div class="rc-meta">
        <span><i>${t('mon.m.id')}</i> DMR ${remoteSrc}</span>
        <span><i>${t('mon.m.country')}</i> ${cty || '-'}</span>
        <span><i>${t('mon.m.tg')}</i> ${currentTg || '-'}</span>
        <span><i>${t('mon.m.time')}</i> ${tsText}</span>
      </div>`;
  }
  async function resolveRemote(src, fromRx) {
    await dmrdb.ensureLoaded();
    const info = dmrdb.lookup(src);
    const newSrc = (remoteSrc !== src);
    if (newSrc) { remoteSrc = src; remoteTs = Date.now(); }   // 换台：记录出现时刻
    else if (fromRx) { remoteTs = Date.now(); }              // 新收到一帧：刷新时间
    const infoChanged = JSON.stringify(info) !== JSON.stringify(remoteInfo);
    remoteInfo = info;
    // 仅当：换台 / 收到RX / 信息变化 / TG变化 才重绘，避免每秒 @@ST 重绘闪烁与“最近时间”走时
    if (newSrc || fromRx || infoChanged || currentTg !== lastRenderedTg) {
      lastRenderedTg = currentTg;
      renderRemote();
    }
  }

  // ---------- 通联记录 ----------
  let qso = [];
  try { qso = JSON.parse(localStorage.getItem(QSO_KEY) || '[]'); } catch (_) { qso = []; }
  function saveQso() { try { localStorage.setItem(QSO_KEY, JSON.stringify(qso.slice(0, 100))); } catch (_) {} }
  function renderQso() {
    const tb = G('#qsoBody');
    if (!qso.length) { tb.innerHTML = `<tr><td colspan="6" class="muted">${t('mon.qsoEmpty')}</td></tr>`; return; }
    tb.innerHTML = qso.map(e => {
      let callsign = t('mon.localTx'), dmrid = '', country = '';
      if (!(e.dir === 'TX' && !e.src)) {
        const info = dmrdb.lookup(e.src);
        callsign = info && info.callsign ? info.callsign : `DMR ${e.src}`;
        dmrid = e.src || '';
        country = info ? countryText(info.countryCode, info.countryText) : '';
      }
      return `<tr class="${e.dir === 'TX' ? 'tx' : 'rx'}">
        <td>${tz.fmtDateTime(e.ts)}</td>
        <td>${e.dir}</td>
        <td>${callsign}</td>
        <td>${dmrid}</td>
        <td>${country}</td>
        <td>${e.tg || ''}</td>
      </tr>`;
    }).join('');
  }
  function addQso(dir, src, tg) {
    qso.unshift({ ts: Date.now(), dir, src, tg });
    if (qso.length > 100) qso.length = 100;
    saveQso(); renderQso();
  }
  function exportCsv() {
    const header = ['datetime', 'dir', 'callsign', 'dmrid', 'country', 'tg'];
    const lines = [header.join(',')];
    for (const e of qso) {
      let callsign = t('mon.localTx'), dmrid = '', country = '';
      if (!(e.dir === 'TX' && !e.src)) {
        const info = dmrdb.lookup(e.src);
        callsign = info && info.callsign ? info.callsign : `DMR ${e.src}`;
        dmrid = e.src || '';
        country = info ? countryText(info.countryCode, info.countryText) : '';
      }
      lines.push([tz.fmtIso(e.ts), e.dir, callsign, dmrid, country, e.tg || ''].map(csvCell).join(','));
    }
    const blob = new Blob(['﻿' + lines.join('\r\n')], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = `qso_${tz.fmtStamp(Date.now())}.csv`;
    document.body.appendChild(a); a.click(); a.remove();
    URL.revokeObjectURL(url);
  }
  renderQso();

  // ---------- 实时行处理 ----------
  function updateGrid(line) {
    const get = (k) => { const m = line.match(new RegExp(k + '=(\\S+)')); return m ? m[1] : null; };
    const wifi = get('wifi'), bm = get('bm'), vol = get('vol'), tg = get('tg'), src = get('src'), rg = get('rg');
    if (wifi) G('#s_wifi').textContent = wifi;
    if (bm) G('#s_bm').textContent = bm;
    if (vol) G('#s_vol').textContent = vol;
    if (tg) { G('#s_tg').textContent = tg; currentTg = tg; }
    if (src) { G('#s_src').textContent = src; if (src !== '0') { currentTg = rg || currentTg; resolveRemote(src); } }
    if (rg) G('#s_rg').textContent = rg;
  }

  const sub = core.onLine((line) => {
    append(line);
    if (line.startsWith('@@ST ')) updateGrid(line);
    else if (line.startsWith('@@RX 1')) {
      const m = line.match(/src=(\d+)\s+tg=(\d+)/);
      setBadge(G('#mRx'), m ? `${t('mon.rxBusy')} (src=${m[1]} TG=${m[2]})` : t('mon.rxBusy'), 'active');
      if (m) { resolveRemote(m[1], true); addQso('RX', m[1], m[2]); }
    } else if (line === '@@RX 0') setBadge(G('#mRx'), t('mon.rxIdle'), 'idle');
    else if (line.startsWith('@@TX 1')) {
      const m = line.match(/tg=(\d+)/);
      setBadge(G('#mTx'), t('mon.txBusy'), 'active');
      if (m) addQso('TX', null, m[1]);
    } else if (line === '@@TX 0') setBadge(G('#mTx'), t('mon.txIdle'), 'idle');
  });

  view.querySelector('#mClear').addEventListener('click', () => { logEl.textContent = ''; });
  view.querySelector('#mCopy').addEventListener('click', async () => {
    try {
      await navigator.clipboard.writeText(logEl.textContent);
      const b = view.querySelector('#mCopy'); b.textContent = t('mon.copied');
      setTimeout(() => { if (b) b.textContent = t('mon.copyLog'); }, 1500);
    } catch (_) { alert(t('mon.copyFail')); }
  });
  view.querySelector('#qsoClear').addEventListener('click', () => { qso = []; saveQso(); renderQso(); });
  view.querySelector('#qsoExport').addEventListener('click', exportCsv);

  // ---------- 累计使用时长（登录后活动总结用） ----------
  const USAGE_KEY = 'mmdvm_usage_ms';
  let usageAcc = Number(localStorage.getItem(USAGE_KEY) || 0);
  let usageCounting = false, usageT0 = 0;
  function usageFlush() {
    if (usageCounting) { usageAcc += Date.now() - usageT0; usageT0 = Date.now(); }
    try { localStorage.setItem(USAGE_KEY, String(usageAcc)); } catch (_) {}
  }
  const usageUnsub = core.onStatus((s) => {
    const connected = s.devState === '已连接';
    if (connected && !usageCounting) { usageCounting = true; usageT0 = Date.now(); }
    else if (!connected && usageCounting) { usageAcc += Date.now() - usageT0; usageCounting = false; try { localStorage.setItem(USAGE_KEY, String(usageAcc)); } catch (_) {} }
  });
  const usageTimer = setInterval(usageFlush, 30000);

  return () => { sub(); usageUnsub(); clearInterval(usageTimer); usageFlush(); };
}

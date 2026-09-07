// pages/activity.js — 登录后弹出的「活动小结」窗口（30s 自动消失）
// 数据全部来自浏览器本地：mmdvm_qso（通联记录）与 mmdvm_usage_ms（累计连接时长），无需服务器。
// 同时把打赏文案 + 赞赏码直接展示在小结里，减少用户跳转到账户页的犹豫成本。
import { t } from '../i18n.js';
import * as dmrdb from '../dmrdb.js';

const QSO_KEY = 'mmdvm_qso';
const USAGE_KEY = 'mmdvm_usage_ms';

export async function showActivitySummary() {
  // 防止重复弹出
  if (document.getElementById('activitySummary')) return;

  let qso = [];
  try { qso = JSON.parse(localStorage.getItem(QSO_KEY) || '[]'); } catch (_) { qso = []; }
  const ms = Number(localStorage.getItem(USAGE_KEY) || 0);
  const minutes = Math.max(0, Math.round(ms / 60000));

  // 先触发呼号库加载（失败也不阻塞弹窗）
  dmrdb.ensureLoaded().catch(() => {});

  // 根据本地 QSO 推导「与哪些友台通联过、来自几个国家」；呼号库未就绪时退化为 DMR ID
  const buildPhrase = () => {
    const callsigns = new Map(); // cs -> countryCode
    const countries = new Set();
    for (const e of qso) {
      if (e.dir !== 'RX' || !e.src) continue;
      let info = null;
      try { info = dmrdb.lookup(e.src); } catch (_) { info = null; }
      const cs = (info && info.callsign) ? info.callsign : ('DMR ' + e.src);
      if (!callsigns.has(cs)) {
        const code = (info && info.countryCode) ? info.countryCode : '';
        callsigns.set(cs, code);
        if (code) countries.add(code);
      }
    }
    const csList = [...callsigns.keys()];
    if (csList.length === 0) {
      return `欢迎回来，您已累计使用 QMS 电台 ${minutes} 分钟。`;
    }
    const sample = csList.slice(0, 3).join('、');
    const more = csList.length > 3 ? ` 等 ${csList.length}` : '';
    const ctry = countries.size > 0 ? `来自 ${countries.size} 个国家和地区的` : '';
    const stationPhrase = `，与 ${sample}${more} ${ctry}友台进行了非常愉快的通联`;
    return `欢迎回来，您已累计使用 QMS 电台 ${minutes} 分钟${stationPhrase}。`;
  };

  const mask = document.createElement('div');
  mask.className = 'modal-mask';
  mask.id = 'activitySummary';
  mask.innerHTML = `
    <div class="modal" role="dialog" aria-modal="true" style="width:480px;max-width:94vw">
      <button class="modal-x" aria-label="关闭" id="asClose">×</button>
      <h3>${t('act.title')}</h3>
      <p class="lede" id="asMsg" style="line-height:1.85">${buildPhrase()}</p>

      <hr style="border:none;border-top:1px solid var(--line);margin:16px 0" />

      <div style="text-align:center">
        <h4 style="margin:0 0 6px;font-size:15px">${t('acc.donateTitle')}</h4>
        <p class="sub" style="margin:0 0 12px">${t('acc.donateText')}</p>
        <div class="row" style="align-items:flex-start;justify-content:center">
          <img src="/img/wechat_tip.jpg" alt="${t('acc.donateQRAlt')}"
               style="width:240px;height:240px;border-radius:10px;border:1px solid var(--line);background:#fff" />
          <p class="info" style="max-width:200px;margin:0;text-align:center">${t('acc.donateNote')}</p>
        </div>
      </div>

      <div class="row" style="margin-top:18px;justify-content:flex-end">
        <button class="primary" id="asOk">${t('act.ok')}</button>
      </div>
    </div>`;
  document.body.appendChild(mask);

  const close = () => { if (mask.parentNode) mask.remove(); };
  mask.addEventListener('click', (ev) => { if (ev.target === mask) close(); });
  mask.querySelector('#asClose').addEventListener('click', close);
  mask.querySelector('#asOk').addEventListener('click', close);
  setTimeout(close, 30000); // 30s 后自动消失

  // 呼号库加载完后再刷新一次电台名（若首屏时库尚未就绪）
  dmrdb.ensureLoaded().then(() => {
    const msgEl = mask.querySelector('#asMsg');
    if (msgEl && mask.parentNode) msgEl.textContent = buildPhrase();
  }).catch(() => {});
}

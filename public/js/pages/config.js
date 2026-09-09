// pages/config.js — 写入参数：CPS? 读取 + CPS SET 逐项 + CPS APPLY 提交
import { core } from '../core.js';
import { lookupCallsign } from '../prefixes.js';
import { flagImg } from '../flags.js';
import { t } from '../i18n.js';

// 设备回显的 @@CFG 中 bmpass 属敏感字段，原样打印会明文泄露，这里做脱敏
function redactCfg(line) {
  if (!line.startsWith('@@CFG')) return line;
  return line.replace(/(\bbmpass=)([^\s]+)/g, '$1****');
}

function localTzOffsetMin() {
  return -new Date().getTimezoneOffset(); // 东八区 = 480
}

// BrandMeister 主机列表（来源 tools/s3_console.py，2026-08 抓取）
// 4602 中国区主服务器置首，其余按国家代码排序；datalist 既可选也可手动输入其它。
const BM_HOSTS = [
  { a: 'dmr.nrlptt.com', c: '国产 BM 网络 · nrlptt (标准 MMDVM)' },
  { a: '4602.master.brandmeister.network', c: '中国' },
  { a: '2322.master.brandmeister.network', c: '奥地利' },
  { a: '5051.master.brandmeister.network', c: '澳大利亚' },
  { a: '2061.master.brandmeister.network', c: '比利时' },
  { a: '2841.master.brandmeister.network', c: '保加利亚' },
  { a: '7242.master.brandmeister.network', c: '巴西' },
  { a: '3021.master.brandmeister.network', c: '加拿大' },
  { a: '2282.master.brandmeister.network', c: '瑞士' },
  { a: '7301.master.brandmeister.network', c: '智利' },
  { a: '2302.master.brandmeister.network', c: '捷克' },
  { a: '2621.master.brandmeister.network', c: '德国' },
  { a: '2622.master.brandmeister.network', c: '德国' },
  { a: '2382.master.brandmeister.network', c: '丹麦' },
  { a: '2141.master.brandmeister.network', c: '西班牙' },
  { a: '2441.master.brandmeister.network', c: '芬兰' },
  { a: '2082.master.brandmeister.network', c: '法国' },
  { a: '2081.master.brandmeister.network', c: '法国' },
  { a: '2341.master.brandmeister.network', c: '英国' },
  { a: '2022.master.brandmeister.network', c: '希腊' },
  { a: '2162.master.brandmeister.network', c: '匈牙利' },
  { a: '2721.master.brandmeister.network', c: '爱尔兰' },
  { a: '4251.master.brandmeister.network', c: '以色列' },
  { a: '2222.master.brandmeister.network', c: '意大利' },
  { a: '4501.master.brandmeister.network', c: '韩国' },
  { a: '3341.master.brandmeister.network', c: '墨西哥' },
  { a: '5021.master.brandmeister.network', c: '马来西亚' },
  { a: '2041.master.brandmeister.network', c: '荷兰' },
  { a: '2421.master.brandmeister.network', c: '挪威' },
  { a: '5151.master.brandmeister.network', c: '菲律宾' },
  { a: '2602.master.brandmeister.network', c: '波兰' },
  { a: '2682.master.brandmeister.network', c: '葡萄牙' },
  { a: '2262.master.brandmeister.network', c: '罗马尼亚' },
  { a: '2503.master.brandmeister.network', c: '俄罗斯' },
  { a: '2502.master.brandmeister.network', c: '俄罗斯' },
  { a: '2402.master.brandmeister.network', c: '瑞典' },
  { a: '2931.master.brandmeister.network', c: '斯洛文尼亚' },
  { a: '3102.master.brandmeister.network', c: '美国' },
  { a: '3103.master.brandmeister.network', c: '美国' },
  { a: '3104.master.brandmeister.network', c: '美国' },
  { a: '6551.master.brandmeister.network', c: '南非' },
];

export async function renderConfig(view) {
  // 分组定义（文案取 i18n，确保语言切换后生效）
  const GROUPS = [
    { key: 'net', title: t('cfg.g.net'), desc: t('cfg.g.net.desc'), fields: [
      { k: 'ssid', label: t('cfg.f.ssid'), type: 'text', required: true },
      { k: 'pass', label: t('cfg.f.pass'), type: 'password', required: true },
    ]},
    { key: 'bm', title: t('cfg.g.bm'), desc: t('cfg.g.bm.desc'), fields: [
      { k: 'host', label: t('cfg.f.host'), type: 'text', list: 'bmHosts', placeholder: '4602.master.brandmeister.network', required: true },
      { k: 'port', label: t('cfg.f.port'), type: 'number', placeholder: '62031', required: true },
      { k: 'bmpass', label: t('cfg.f.bmpass'), type: 'password', required: true },
    ]},
    { key: 'id', title: t('cfg.g.id'), desc: t('cfg.g.id.desc'), fields: [
      { k: 'callsign', label: t('cfg.f.callsign'), type: 'text', placeholder: 'BA4QMS', required: true },
      { k: 'dmrid', label: t('cfg.f.dmrid'), type: 'number', placeholder: '4610200', required: true },
      { k: 'essid', label: t('cfg.f.essid'), type: 'number', placeholder: '2', help: t('cfg.h.essid') },
    ]},
    { key: 'pref', title: t('cfg.g.pref'), desc: t('cfg.g.pref.desc'), fields: [
      { k: 'tg', label: t('cfg.f.tg'), type: 'number', placeholder: '46001', required: true },
      { k: 'tz', label: t('cfg.f.tz'), type: 'number', placeholder: '480', help: t('cfg.h.tz'), withTzBtn: true },
      { k: 'volume', label: t('cfg.f.volume'), type: 'number', placeholder: '60' },
    ]},
  ];
  const ALL = GROUPS.flatMap(g => g.fields);

  const groupsHtml = GROUPS.map(g => `
    <fieldset class="cfg-group">
      <legend>${g.title}</legend>
      ${g.desc ? `<p class="group-desc">${g.desc}</p>` : ''}
      ${g.fields.map(f => `
        <div class="cfg-field">
          <label>${f.label}
            <input id="f_${f.k}" type="${f.type}" placeholder="${f.placeholder || ''}" ${f.required ? 'required' : ''} ${f.list ? `list="${f.list}"` : ''} />
          </label>
          ${f.help ? `<span class="field-help">${f.help}</span>` : ''}
          ${f.withTzBtn ? `<button type="button" id="tzFill" class="mini">${t('cfg.tzFill')}</button>` : ''}
        </div>`).join('')}
    </fieldset>`).join('');

  view.innerHTML = `
    <section class="card">
      <h2>${t('cfg.title')}</h2>
      <p class="sub">${t('cfg.sub')}</p>
      <div class="warn-box">${t('cfg.comWarn')}</div>
      <div class="row toolbar">
        <button id="cfgRead" class="primary">${t('cfg.read')}</button>
        <button id="cfgApply">${t('cfg.apply')}</button>
        <span id="cfgState" class="info">${t('cfg.st.noDev')}</span>
      </div>
      <form id="cfgForm" class="cfg-form">${groupsHtml}</form>
    </section>
    <section class="card">
      <h2>${t('cfg.respTitle')}</h2>
      <pre id="cfgLog" class="log" style="height:200px"></pre>
    </section>`;

  const logEl = view.querySelector('#cfgLog');
  const stateEl = view.querySelector('#cfgState');
  const out = (txt) => { logEl.textContent += txt + '\n'; logEl.scrollTop = logEl.scrollHeight; };

  // BM 服务器地址下拉（datalist：可选取也可手填）
  view.querySelector('#cfgForm').insertAdjacentHTML('beforeend',
    '<datalist id="bmHosts">' + BM_HOSTS.map(h => `<option value="${h.a}">${h.a} — ${h.c}</option>`).join('') + '</datalist>');

  // 反映真实连接状态：已连接却仍显示“设备未连接”的修复
  let lastDev = null;
  function syncDevState() {
    if (stateEl.dataset.busy === '1') return;        // 读取/写入中，勿被连接事件覆盖
    if (core.devState === lastDev) return;           // 仅连接状态真正变化时才更新
    lastDev = core.devState;
    stateEl.textContent = core.devState === t('state.on') ? t('cfg.st.ready') : t('cfg.st.noDev');
  }
  syncDevState();
  lastDev = core.devState;
  const devUnsub = core.onStatus(syncDevState);

  // 本机呼号 → 国家/国旗 实时提示
  const callsignEl = view.querySelector('#f_callsign');
  const callsignFlag = document.createElement('span');
  callsignFlag.className = 'callsign-flag';
  callsignEl.insertAdjacentElement('afterend', callsignFlag);
  const updateCallsignFlag = () => {
    const info = lookupCallsign(callsignEl.value);
    callsignFlag.innerHTML = info ? `${flagImg(info.code, 'cs-flag')} <span>${info.country}</span>` : '';
  };
  callsignEl.addEventListener('input', updateCallsignFlag);

  // 用本机时区填充 tz 偏移
  view.querySelector('#tzFill').addEventListener('click', () => {
    view.querySelector('#f_tz').value = String(localTzOffsetMin());
  });

  // 等待匹配某条件的设备回行（带超时）
  function waitForLine(pred, timeout = 5000) {
    return new Promise((resolve) => {
      let sub;
      const timer = setTimeout(() => { if (sub) sub(); resolve(null); }, timeout);
      sub = core.onLine((line) => {
        if (pred(line)) { clearTimeout(timer); if (sub) sub(); resolve(line); }
      });
    });
  }

  // 设备未连接时，先弹出浏览器选串口弹窗并连接；返回 true=已就绪可操作
  async function ensureConnected() {
    if (core.port && core.writer) return true;
    out(t('cfg.msg.connecting'));
    stateEl.textContent = t('cfg.st.connecting');
    const ok = await core.connectSerial(); // 内部调用 navigator.serial.requestPort() 弹窗
    if (!ok) {
      out(t('cfg.msg.connectCancel'));
      stateEl.textContent = t('cfg.st.noDev');
      return false;
    }
    out(t('cfg.msg.connected'));
    return true;
  }

  async function readCfg() {
    if (!await ensureConnected()) return; // 未连接：弹窗连接，取消则中止
    stateEl.dataset.busy = '1';
    stateEl.textContent = t('cfg.st.reading');
    const p = waitForLine(l => l.startsWith('@@CFG'));
    try { await core.sendLine('CPS?'); } catch (e) {
      stateEl.dataset.busy = '0';
      stateEl.textContent = t('cfg.st.noDev'); out('错误: ' + e.message); return;
    }
    const line = await p;
    if (!line) { stateEl.dataset.busy = '0'; stateEl.textContent = t('cfg.st.timeout'); out(t('cfg.msg.noCfg')); return; }
    out(redactCfg(line));
    const map = {};
    line.slice(5).trim().split(/\s+/).forEach(tok => {
      const i = tok.indexOf('=');
      if (i > 0) map[tok.slice(0, i)] = tok.slice(i + 1);
    });
    ALL.forEach(f => { const el = view.querySelector('#f_' + f.k); if (el && map[f.k] != null) el.value = map[f.k]; });
    updateCallsignFlag();
    stateEl.dataset.busy = '0';
    stateEl.textContent = t('cfg.st.filled');
  }

  async function applyCfg() {
    if (!await ensureConnected()) return; // 未连接：弹窗连接，取消则中止
    stateEl.dataset.busy = '1';
    stateEl.textContent = t('cfg.st.writing');
    for (const f of ALL) {
      const el = view.querySelector('#f_' + f.k);
      const v = el.value.trim();
      if (!v) { if (f.required) { stateEl.dataset.busy = '0'; out(t('cfg.msg.required')); stateEl.textContent = t('cfg.st.abort'); return; } else continue; }
      const p = waitForLine(l => l.startsWith('@@SET'));
      try { await core.sendLine(`CPS SET ${f.k} ${v}`); } catch (e) {
        stateEl.dataset.busy = '0'; out('设备未连接: ' + e.message); stateEl.textContent = t('cfg.st.noDev'); return;
      }
      const r = await p;
      out(r || `[${f.k}] ${t('cfg.msg.noAck')}`);
      if (!r || r.startsWith('@@SET err')) { stateEl.dataset.busy = '0'; stateEl.textContent = t('cfg.st.fail'); return; }
    }
    out(t('cfg.msg.staged'));
    const p2 = waitForLine(l => l.startsWith('@@CPS'));
    await core.sendLine('CPS APPLY');
    const r2 = await p2;
    out(r2 || t('cfg.msg.noAck'));
    stateEl.dataset.busy = '0';
    stateEl.textContent = r2 && r2.startsWith('@@CPS OK') ? t('cfg.st.rebooting') : t('cfg.st.incomplete');
  }

  view.querySelector('#cfgRead').addEventListener('click', readCfg);
  view.querySelector('#cfgApply').addEventListener('click', applyCfg);
  return () => devUnsub();
}

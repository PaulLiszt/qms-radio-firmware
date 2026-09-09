// app.js — 启动入口：应用外壳 + 哈希路由 + 顶栏设备连接/状态/语言
import { core } from './core.js';
import { t, toggleLang } from './i18n.js';
import { initTz } from './tz.js';
import { renderHome } from './pages/home.js';
import { renderFirmware } from './pages/firmware.js';
import { renderConfig } from './pages/config.js';

// 本开源仓库仅保留两项浏览器内功能（均经 Web Serial，纯前端、无需登录/服务端）：
//   - 烧写固件（firmware）：esptool-js 一键烧写
//   - 写入参数（config）：把呼号 / DMR ID / 网络等参数写入设备
// 监视 / 账户 / 管理后台等需要服务端的功能，请前往托管站点 https://ba4qms.top 体验。
const routes = {
  home:     { render: renderHome,     auth: false },
  firmware: { render: renderFirmware, auth: false },
  config:   { render: renderConfig,   auth: false },
};

let cleanup = null; // 当前页面的卸载函数

function currentRoute() {
  const h = (location.hash || '').replace(/^#\/?/, '');
  return routes[h] ? h : 'home';
}

async function mount() {
  if (cleanup) { try { cleanup(); } catch (_) {} cleanup = null; }
  const route = currentRoute();
  const def = routes[route];
  document.querySelectorAll('.nav a').forEach(a => a.classList.toggle('active', a.dataset.route === route));
  const view = document.getElementById('view');
  cleanup = (await def.render(view)) || null;
}

// ---------- 应用外壳 ----------
function renderShell() {
  document.getElementById('app').innerHTML = `
    <header class="topbar">
      <div class="brand">${t('brand')} <b>S3</b></div>
      <nav class="nav">
        <a data-route="home">${t('nav.home')}</a>
        <a data-route="firmware">${t('nav.firmware')}</a>
        <a data-route="config">${t('nav.config')}</a>
      </nav>
      <div class="topright">
        <button id="sbConnect" class="mini">${t('top.connect')}</button>
        <span id="sbDev" class="chip">${t('top.device')}:${core.devState}</span>
        <button id="langBtn" class="mini" title="Language / 语言">${t('top.langBtn')}</button>
      </div>
    </header>
    <div id="devBanner" class="banner" hidden>
      <span id="devBannerMsg"></span>
      <button id="devBannerClose" class="bannerClose" title="关闭">×</button>
    </div>
    <main id="view" class="view"></main>`;

  document.querySelectorAll('.nav a').forEach(a =>
    a.addEventListener('click', () => { location.hash = '#/' + a.dataset.route; }));

  // 连接 / 断开设备（写参数与烧写前都需先连串口）
  const sbConnect = document.getElementById('sbConnect');
  sbConnect.addEventListener('click', () => {
    if (core.devState === '已连接') core.disconnectSerial();
    else core.connectSerial();
  });
  document.getElementById('langBtn').addEventListener('click', () => toggleLang());

  core.onStatus((s) => {
    const dev = document.getElementById('sbDev');
    if (dev) {
      dev.textContent = t('top.device') + ':' + s.devState;
      dev.className = 'chip ' + (s.devState === '已连接' ? 'ok' : (s.devError ? 'err' : 'warn'));
    }
    const cbtn = document.getElementById('sbConnect');
    if (cbtn) cbtn.textContent = s.devState === '已连接' ? t('top.disconnect') : t('top.connect');
    // 端口错误横幅
    const banner = document.getElementById('devBanner');
    const bmsg = document.getElementById('devBannerMsg');
    if (banner && bmsg) {
      if (s.devError) { bmsg.textContent = t(s.devError); banner.hidden = false; }
      else { banner.hidden = true; }
    }
  });

  // 关闭端口错误横幅（仅隐藏，下次连错口会再次弹出）
  const bannerClose = document.getElementById('devBannerClose');
  if (bannerClose) bannerClose.addEventListener('click', () => {
    core.devError = null;
    const b = document.getElementById('devBanner'); if (b) b.hidden = true;
  });

  window.addEventListener('hashchange', mount);
}

// ---------- 启动 ----------
(async function boot() {
  // 开源版无账户体系，这里仅尝试恢复会话（通常为游客），不强制登录
  await core.refreshMe();
  renderShell();
  initTz(); // 启动即按浏览器/IP 校正时区（后台异步，不阻塞首屏）
  if (!location.hash) location.hash = '#/home';
  mount();
})();

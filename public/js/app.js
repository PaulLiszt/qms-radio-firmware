// app.js — 启动入口：应用外壳 + 哈希路由 + 按页面登录门禁 + 顶栏状态/用户区
import { core } from './core.js';
import { t, toggleLang } from './i18n.js';
import { openAuthModal } from './authmodal.js';
import { initTz } from './tz.js';
import { renderHome } from './pages/home.js';
import { renderFirmware } from './pages/firmware.js';
import { renderConfig } from './pages/config.js';
import { renderMonitor } from './pages/monitor.js';
import { renderAccount } from './pages/account.js';
import { renderAdmin } from './pages/admin.js';

// auth=true 的页面需登录（令牌通道）才能使用；其余页面公开。
const routes = {
  home:     { render: renderHome,     auth: false },
  firmware: { render: renderFirmware, auth: true  },
  config:   { render: renderConfig,   auth: true  },
  monitor:  { render: renderMonitor,  auth: true  },
  account:  { render: renderAccount,  auth: true  },
  admin:    { render: renderAdmin,    auth: true  },
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

  // 登录门禁：受保护页面且未登录 → 弹出注册/登录模态，背景给一个友好占位
  if (def.auth && !core.user) {
    view.innerHTML = `
      <section class="card placeholder">
        <h2>${t('auth.needLogin')}</h2>
        <p class="sub">${t('auth.needLoginDesc')}</p>
        <div class="row">
          <button id="phLogin" class="primary">${t('top.login')}</button>
          <a class="ghost" href="#/home">${t('nav.home')}</a>
        </div>
      </section>`;
    const open = () => openAuthModal({ mode: 'login', onDone: () => mount() });
    view.querySelector('#phLogin').addEventListener('click', open);
    open(); // 未登录访问受保护页 → 直接弹出注册/登录界面
    return;
  }

  // 进入受保护页面且已登录但未连令牌通道时，自动连接（用于设备 AUTH）
  if (def.auth && core.user && (core.wsState === '未连接' || core.wsState === '已断开')) core.connectWs();

  cleanup = (await def.render(view)) || null;
  updateUserBox();
}

// ---------- 顶栏右上角用户区（语言/登录/注册/退出） ----------
function updateUserBox() {
  const box = document.getElementById('userBox');
  if (!box) return;
  if (core.user) {
    box.innerHTML = `<span class="uname">${core.user.username}</span><button class="mini" data-act="logout">${t('top.logout')}</button>`;
  } else {
    box.innerHTML = `<button class="mini" data-act="login">${t('top.login')}</button><button class="mini" data-act="register">${t('top.register')}</button>`;
  }
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
        <a data-route="monitor">${t('nav.monitor')}</a>
        <a data-route="account">${t('nav.account')}</a>
        <a data-route="admin" id="navAdmin" style="display:none">${t('admin.nav')}</a>
      </nav>
      <div class="topright">
        <button id="sbConnect" class="mini">${t('top.connect')}</button>
        <span id="sbWs" class="chip">${t('top.token')}:${core.wsState}</span>
        <span id="sbDev" class="chip">${t('top.device')}:${core.devState}</span>
        <button id="langBtn" class="mini" title="Language / 语言">${t('top.langBtn')}</button>
        <span id="userBox"></span>
      </div>
    </header>
    <div id="devBanner" class="banner" hidden>
      <span id="devBannerMsg"></span>
      <button id="devBannerClose" class="bannerClose" title="关闭">×</button>
    </div>
    <main id="view" class="view"></main>`;

  document.querySelectorAll('.nav a').forEach(a =>
    a.addEventListener('click', () => { location.hash = '#/' + a.dataset.route; }));

  // 管理员导航仅在 isAdmin 时显示（服务端识别，前端不可伪造）
  function syncAdminNav() {
    const el = document.getElementById('navAdmin');
    if (el) el.style.display = (core.user && core.user.isAdmin) ? '' : 'none';
  }
  syncAdminNav();

  const sbConnect = document.getElementById('sbConnect');
  sbConnect.addEventListener('click', () => {
    if (core.devState === '已连接') core.disconnectSerial();
    else core.connectSerial();
  });
  document.getElementById('langBtn').addEventListener('click', () => toggleLang());
  document.getElementById('userBox').addEventListener('click', (e) => {
    const act = e.target.dataset.act;
    if (act === 'login') openAuthModal({ mode: 'login', onDone: () => mount() });
    else if (act === 'register') openAuthModal({ mode: 'register', onDone: () => mount() });
    else if (act === 'logout') core.logout();
  });

  core.onStatus((s) => {
    const ws = document.getElementById('sbWs');
    const dev = document.getElementById('sbDev');
    if (ws) { ws.textContent = t('top.token') + ':' + s.wsState; ws.className = 'chip ' + (s.wsState === '已连接' ? 'ok' : 'warn'); }
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
    updateUserBox();
    syncAdminNav();
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
  // 不强制登录：先尝试恢复会话（有 cookie 则 core.user 非空），否则游客访问公开页
  const user = await core.refreshMe();
  renderShell();
  initTz(); // 启动即按浏览器/IP 校正时区（后台异步，不阻塞首屏）
  // 默认首页；若当前 hash 指向「需登录页」而用户未登录，重置到首页，避免一打开就弹登录
  const initial = currentRoute();
  if (!location.hash || (routes[initial].auth && !user)) location.hash = '#/home';
  if (user) core.connectWs(); // 已登录用户直接建令牌通道，便于随后连接设备授权
  mount();
})();

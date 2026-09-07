// authmodal.js — 登录 / 注册（单步，邮箱仅留存不验证）/ 注册申诉 模态窗口
// 由 app.js 在「右上角按钮」或「未登录访问受保护页」时调用。
import { core } from './core.js';
import { t } from './i18n.js';
import { showActivitySummary } from './pages/activity.js';

let maskEl = null;

export function closeAuthModal() {
  if (maskEl) { maskEl.remove(); maskEl = null; }
}

function errText(code, message) {
  if (message) return message;
  switch (code) {
    case 'callsign_exists': return t('auth.err.callsignExists');
    case 'dmr_exists': return t('auth.err.dmrExists');
    case 'email_exists': return t('auth.err.emailExists');
    case 'dmr_mismatch': return t('auth.err.dmrMismatch');
    case 'dmr_unknown': return t('auth.err.dmrUnknown');
    case 'bad_callsign': return t('auth.err.badCallsign');
    case 'bad_dmrid': return t('auth.err.badDmr');
    case 'bad_email': return t('auth.err.badEmail');
    case 'weak_password': return t('auth.err.weak');
    case 'mismatch': return t('auth.err.mismatch');
    case 'missing_docs': return t('auth.err.missingDocs');
    default: return t('auth.err.net');
  }
}

function fileToDataUrl(file) {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(r.result);
    r.onerror = () => reject(new Error('read fail'));
    r.readAsDataURL(file);
  });
}

// openAuthModal({ mode:'login'|'register', onDone, onCancel })
export function openAuthModal({ mode = 'login', onDone, onCancel } = {}) {
  closeAuthModal();
  let m = mode === 'register' ? 'register' : 'login';
  const reg = { callsign: '', dmrId: '', email: '', password: '' }; // 跨步骤保留

  const mask = document.createElement('div');
  mask.className = 'modal-mask';
  mask.addEventListener('click', (e) => { if (e.target === mask) { closeAuthModal(); if (onCancel) onCancel(); } });

  function render() {
    let body;
    if (m === 'login') body = loginHtml();
    else if (m === 'appeal') body = appealHtml();
    else body = regHtml();

    mask.innerHTML = `
      <div class="modal" role="dialog" aria-modal="true">
        <button class="modal-x" aria-label="关闭" title="${t('auth.cancel')}">×</button>
        ${body}
      </div>`;
    mask.querySelector('.modal-x').addEventListener('click', () => { closeAuthModal(); if (onCancel) onCancel(); });
    if (m === 'login') wireLogin();
    else if (m === 'appeal') wireAppeal();
    else wireReg();
  }

  // ---------- 登录 ----------
  function loginHtml() {
    return `
      <h3>${t('auth.loginTitle')}</h3>
      <form id="authForm">
        <label>${t('auth.username')}<input id="aUser" type="text" autocomplete="username" required /></label>
        <label>${t('auth.password')}<input id="aPass" type="password" autocomplete="current-password" required /></label>
        <p id="authErr" class="err"></p>
        <button type="submit" class="primary">${t('auth.submitLogin')}</button>
      </form>
      <p class="modal-switch">${t('auth.toReg')} <a id="authSwitch" href="javascript:void(0)">${t('auth.regTitle')}</a></p>`;
  }
  function wireLogin() {
    mask.querySelector('#authSwitch').addEventListener('click', (e) => { e.preventDefault(); m = 'register'; render(); });
    mask.querySelector('#authForm').addEventListener('submit', async (e) => {
      e.preventDefault();
      const err = mask.querySelector('#authErr');
      err.textContent = '';
      const user = mask.querySelector('#aUser').value.trim();
      const pass = mask.querySelector('#aPass').value;
      if (!user || !pass) { err.textContent = t('auth.err.creds'); return; }
      const ok = await core.login(user, pass);
      if (!ok) { err.textContent = t('auth.err.creds'); return; }
      closeAuthModal();
      showActivitySummary();
      if (onDone) onDone();
    });
  }

  // ---------- 注册：单步（邮箱仅留存，不验证） ----------
  function regHtml() {
    return `
      <h3>${t('auth.regTitle')}</h3>
      <p class="hint">${t('auth.regHint')}</p>
      <form id="authForm">
        <label>${t('auth.callsign')}<input id="aCs" type="text" autocomplete="username" required placeholder="如 BG3KBH" /></label>
        <label>${t('auth.dmrid')}<input id="aDmr" type="text" inputmode="numeric" required placeholder="如 4600383" /></label>
        <label>${t('auth.password')}<input id="aPass" type="password" autocomplete="new-password" required /></label>
        <label>${t('auth.password2')}<input id="aPass2" type="password" autocomplete="new-password" required /></label>
        <label>${t('auth.email')}<input id="aEmail" type="email" required placeholder="用于账户找回与申诉" /></label>
        <p id="authErr" class="err"></p>
        <button type="submit" class="primary">${t('auth.submitReg')}</button>
        <button type="button" class="ghost" id="appealFromReg" style="margin-top:8px">${t('auth.appealBtn')}</button>
      </form>
      <p class="modal-switch">${t('auth.toLogin')} <a id="authSwitch" href="javascript:void(0)">${t('auth.loginTitle')}</a></p>`;
  }
  function wireReg() {
    mask.querySelector('#authSwitch').addEventListener('click', (e) => { e.preventDefault(); m = 'login'; render(); });
    mask.querySelector('#appealFromReg').addEventListener('click', () => {
      const cs = mask.querySelector('#aCs').value.trim();
      const em = mask.querySelector('#aEmail').value.trim();
      reg.callsign = cs; reg.email = em; m = 'appeal'; render();
    });
    mask.querySelector('#authForm').addEventListener('submit', async (e) => {
      e.preventDefault();
      const err = mask.querySelector('#authErr');
      err.textContent = '';
      const callsign = mask.querySelector('#aCs').value.trim();
      const dmrId = mask.querySelector('#aDmr').value.trim();
      const email = mask.querySelector('#aEmail').value.trim();
      const password = mask.querySelector('#aPass').value;
      const password2 = mask.querySelector('#aPass2').value;
      // 前端先校验完整性与格式，符合预期逻辑后再请求建账户（服务端仍会二次校验）
      if (!/^[A-Z0-9]{2,12}([-/][A-Z0-9]{1,4})?$/.test(callsign.toUpperCase())) { err.textContent = t('auth.err.badCallsign'); return; }
      if (!/^\d{1,9}$/.test(dmrId)) { err.textContent = t('auth.err.badDmr'); return; }
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) { err.textContent = t('auth.err.badEmail'); return; }
      if (password.length < 6) { err.textContent = t('auth.err.weak'); return; }
      if (password !== password2) { err.textContent = t('auth.err.mismatch'); return; }

      const r = await fetch('/api/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ callsign, dmrId, email, password, password2 }),
      }).then(res => res.json()).catch(() => ({ ok: false, error: 'net' }));
      if (!r.ok) {
        if (r.error === 'callsign_exists') {
          err.textContent = t('auth.takenHint');
        } else {
          err.textContent = errText(r.error, r.message);
        }
        return;
      }
      // 成功：注册即建会话，刷新登录态后关闭
      await core.refreshMe();
      closeAuthModal();
      showActivitySummary();
      if (onDone) onDone();
    });
  }

  // ---------- 注册申诉 ----------
  function appealHtml() {
    return `
      <h3>${t('auth.appealTitle')}</h3>
      <p class="hint">${t('auth.appealHint')}</p>
      <form id="authForm">
        <label>${t('auth.callsign')}<input id="aCs" type="text" value="${reg.callsign || ''}" required /></label>
        <label>${t('auth.email')}<input id="aEmail" type="email" value="${reg.email || ''}" required /></label>
        <label>${t('auth.appealCert')}<input id="aCert" type="file" accept="image/*" required /></label>
        <label>${t('auth.appealLicense')}<input id="aLic" type="file" accept="image/*" required /></label>
        <label>${t('auth.appealNote')}<textarea id="aNote" rows="2"></textarea></label>
        <p id="authErr" class="err"></p>
        <button type="submit" class="primary">${t('auth.appealSubmit')}</button>
        <button type="button" class="ghost" id="backBtn">${t('auth.appealBack')}</button>
      </form>`;
  }
  function wireAppeal() {
    mask.querySelector('#backBtn').addEventListener('click', () => { m = 'register'; render(); });
    mask.querySelector('#authForm').addEventListener('submit', async (e) => {
      e.preventDefault();
      const err = mask.querySelector('#authErr');
      err.textContent = '';
      const callsign = mask.querySelector('#aCs').value.trim();
      const email = mask.querySelector('#aEmail').value.trim();
      const certFile = mask.querySelector('#aCert').files[0];
      const licFile = mask.querySelector('#aLic').files[0];
      const note = mask.querySelector('#aNote').value.trim();
      if (!certFile || !licFile) { err.textContent = t('auth.err.missingDocs'); return; }
      try {
        const cert = await fileToDataUrl(certFile);
        const license = await fileToDataUrl(licFile);
        const r = await fetch('/api/appeal', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ callsign, email, cert, license, note }),
        }).then(res => res.json()).catch(() => ({ ok: false, error: 'net' }));
        if (!r.ok) { err.textContent = errText(r.error, r.message); return; }
        alert(t('auth.appealOk'));
        closeAuthModal();
      } catch {
        err.textContent = t('auth.err.net');
      }
    });
  }

  document.body.appendChild(mask);
  maskEl = mask;
  render();
}

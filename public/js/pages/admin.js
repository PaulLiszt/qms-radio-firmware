// pages/admin.js — 管理后台（仅 isAdmin 用户可见；鉴权在服务端）
import { core } from '../core.js';
import { t } from '../i18n.js';

function esc(s) {
  return String(s == null ? '' : s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}
function fmtUptime(sec) {
  const d = Math.floor(sec / 86400), h = Math.floor((sec % 86400) / 3600), m = Math.floor((sec % 3600) / 60);
  return `${d}d ${h}h ${m}m`;
}
function fmtDate(ts) {
  if (!ts) return '-';
  try { return new Date(ts).toLocaleString(); } catch { return String(ts); }
}

// 在站内信列表底部挂载「发送新站内信」表单（每次渲染后重建，不重复）
function appendNewMsgForm(container) {
  const form = document.createElement('div');
  form.id = 'newMsgForm';
  form.className = 'card';
  form.style.marginTop = '12px';
  form.innerHTML = `
    <h3>发送新站内信</h3>
    <form>
      <label>收件人（用户呼号）<input id="nTo" type="text" required placeholder="BG3KBH"></label>
      <label>主题<input id="nSubj" type="text" required></label>
      <label>内容<textarea id="nBody" rows="3" required></textarea></label>
      <p class="sub">${t('admin.msg.noBroadcast')}</p>
      <p id="nErr" class="err"></p>
      <button type="submit" class="primary">发送</button>
    </form>`;
  container.appendChild(form);
  form.querySelector('form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const err = form.querySelector('#nErr'); err.textContent = '';
    const r = await core.api('/api/admin/messages', {
      method: 'POST',
      body: JSON.stringify({ to: form.querySelector('#nTo').value.trim(), subject: form.querySelector('#nSubj').value.trim(), body: form.querySelector('#nBody').value.trim() }),
    });
    if (r.ok) { err.textContent = '已发送'; renderMessages(); } else err.textContent = r.message || '发送失败';
  });
}

export async function renderAdmin(view) {
  view.innerHTML = `
    <section class="card">
      <h2>${t('admin.title')}</h2>
      <div class="tabs" id="adTabs">
        <button data-tab="status" class="active">${t('admin.tabs.status')}</button>
        <button data-tab="users">${t('admin.tabs.users')}</button>
        <button data-tab="msg">${t('admin.tabs.msg')}</button>
        <button data-tab="faq">${t('admin.tabs.faq')}</button>
      </div>
      <div id="adBody" style="margin-top:12px"></div>
    </section>`;

  const body = view.querySelector('#adBody');
  const tabs = view.querySelectorAll('#adTabs button');
  let loaded = {};

  async function show(tab) {
    tabs.forEach(b => b.classList.toggle('active', b.dataset.tab === tab));
    if (tab === 'status') await renderStatus();
    else if (tab === 'users') await renderUsers();
    else if (tab === 'msg') await renderMessages();
    else if (tab === 'faq') await renderFaq();
  }

  async function renderStatus() {
    const r = await core.api('/api/admin/status');
    if (!r.ok) { body.textContent = '无权访问或加载失败'; return; }
    const s = r.status;
    body.innerHTML = `
      <div class="kv"><span class="k">${t('admin.status.uptime')}</span><b>${fmtUptime(s.uptimeSec)}</b></div>
      <div class="kv"><span class="k">${t('admin.status.mem')}</span><b>${s.memMB} MB</b></div>
      <div class="kv"><span class="k">${t('admin.status.node')}</span><b>${esc(s.nodeVersion)}</b></div>
      <div class="kv"><span class="k">${t('admin.status.users')}</span><b>${s.usersTotal}</b></div>
      <div class="kv"><span class="k">${t('admin.status.active')}</span><b>${s.usersActive}</b></div>
      <div class="kv"><span class="k">${t('admin.status.frozen')}</span><b>${s.frozenCount}</b></div>
      <div class="kv"><span class="k">${t('admin.status.appeals')}</span><b>${s.appealsPending}</b></div>
      <div class="kv"><span class="k">${t('admin.status.messages')}</span><b>${s.messagesTotal}</b></div>
      <div class="kv"><span class="k">${t('admin.status.dmr')}</span><b>${s.dmrIndexSize} 条</b></div>`;
  }

  async function renderUsers() {
    if (!loaded.users) loaded.users = await core.api('/api/admin/users');
    const r = loaded.users;
    if (!r.ok) { body.textContent = '加载失败'; return; }
    const us = r.users || [];
    const badge = (on, mod, yesKey, noKey) => `<span class="badge ${on ? mod : 'idle'}">${on ? t(yesKey) : t(noKey)}</span>`;
    let html = `<h3>${t('admin.users.title')}</h3>
      <div class="userTools" id="usrTools">
        <label class="cb"><input type="checkbox" id="selAll"> ${t('admin.users.selectAll')}</label>
        <span class="sep"></span>
        <button class="mini" id="btnFreeze">${t('admin.users.frozenOn')}</button>
        <button class="mini" id="btnUnfreeze">${t('admin.users.frozenOff')}</button>
        <button class="mini danger" id="btnDel">${t('admin.users.batchDelete')}</button>
        <span id="selCount" class="sub"></span>
      </div>
      <div class="tablewrap"><table class="tbl"><thead><tr>
        <th style="width:32px"></th>
        <th>${t('admin.users.callsign')}</th><th>${t('admin.users.dmr')}</th><th>${t('admin.users.email')}</th>
        <th>${t('admin.users.frozen')}</th><th>${t('admin.users.admin')}</th>
      </tr></thead><tbody>`;
    for (const u of us) {
      const isAdm = !!u.isAdmin;
      html += `<tr data-cs="${esc(u.callsign)}">
        <td><input type="checkbox" class="sel" data-cs="${esc(u.callsign)}" ${isAdm ? 'disabled' : ''}></td>
        <td><b>${esc(u.callsign)}</b></td>
        <td>${esc(u.dmrId)}</td>
        <td>${esc(u.email)}</td>
        <td>${badge(!!u.frozen, 'warn', 'common.yes', 'common.no')}</td>
        <td>${isAdm ? t('common.yes') : t('common.no')}</td>
      </tr>`;
    }
    html += `</tbody></table></div>`;
    body.innerHTML = html;

    // 勾选逻辑 + 工具栏按钮启用/禁用
    const selAll = body.querySelector('#selAll');
    const sels = () => Array.from(body.querySelectorAll('.sel:checked'));
    const selable = () => Array.from(body.querySelectorAll('.sel:not([disabled])'));
    const toolBtns = ['btnFreeze', 'btnUnfreeze', 'btnDel'];
    const updateUI = () => {
      const n = sels().length;
      body.querySelector('#selCount').textContent = n ? t('admin.users.selected').replace('{n}', n) : '';
      toolBtns.forEach(id => { const b = body.querySelector('#' + id); if (b) b.disabled = (n === 0); });
      selAll.checked = n > 0 && n === selable().length;
    };
    selAll.addEventListener('change', () => { selable().forEach(c => c.checked = selAll.checked); updateUI(); });
    body.querySelectorAll('.sel').forEach(c => c.addEventListener('change', updateUI));
    updateUI();

    // 顶部：冻结 批量操作（先勾选，再按按钮）
    async function bulk(ids, bodyObj, confirmKey) {
      if (!ids.length) return;
      if (confirmKey && !confirm(t(confirmKey).replace('{n}', ids.length))) return;
      for (const cs of ids) {
        await core.api('/api/admin/users/' + encodeURIComponent(cs), { method: 'POST', body: JSON.stringify(bodyObj) });
      }
      loaded.users = null; await renderUsers();
    }
    body.querySelector('#btnFreeze').addEventListener('click', () => bulk(sels().map(c => c.dataset.cs), { frozen: true }, 'admin.users.confirmFreeze'));
    body.querySelector('#btnUnfreeze').addEventListener('click', () => bulk(sels().map(c => c.dataset.cs), { frozen: false }, 'admin.users.confirmUnfreeze'));

    // 顶部：删除勾选的用户
    body.querySelector('#btnDel').addEventListener('click', async () => {
      const list = sels().map(c => c.dataset.cs);
      if (!list.length) { alert(t('admin.users.noSelect')); return; }
      if (!confirm(t('admin.users.batchDeleteConfirm').replace('{n}', list.length))) return;
      const r2 = await core.api('/api/admin/users', { method: 'DELETE', body: JSON.stringify({ callsigns: list }) });
      if (r2.ok) { loaded.users = null; await renderUsers(); }
      else alert(r2.message || t('admin.users.notFound'));
    });
  }

  async function renderMessages() {
    const r = await core.api('/api/admin/messages');
    if (!r.ok) { body.textContent = '加载失败'; return; }
    const msgs = r.messages || [];
    if (!msgs.length) { body.innerHTML = `<h3>${t('admin.msg.title')}</h3><p class="sub">${t('admin.msg.empty')}</p>`; return; }
    let html = `<h3>${t('admin.msg.title')}</h3><div class="msgs">`;
    for (const m of msgs) {
      html += `<div class="msg" data-id="${esc(m.id)}">
        <div class="msg-h"><b>${esc(m.subject)}</b> · ${t('admin.msg.from')}:${esc(m.from)} → ${esc(m.to)} · ${fmtDate(m.ts)} ${m.read ? '' : '· <span class="unread">未读</span>'}</div>
        <div class="msg-b">${esc(m.body)}</div>
        <div class="msg-actions">
          <button class="mini adm-reply">${t('admin.msg.reply')}</button>
          ${m.read ? '' : '<button class="mini adm-read">标记已读</button>'}
        </div>
        <div class="reply-box" style="display:none"><textarea class="adm-reply-body" rows="2"></textarea><button class="mini adm-reply-send">${t('admin.msg.reply')}</button></div>
      </div>`;
    }
    html += `</div>`;
    body.innerHTML = html;
    body.querySelectorAll('.msg').forEach(box => {
      const id = box.dataset.id;
      const replyBtn = box.querySelector('.adm-reply');
      const replyBox = box.querySelector('.reply-box');
      replyBtn.addEventListener('click', () => { replyBox.style.display = replyBox.style.display === 'none' ? 'block' : 'none'; });
      box.querySelector('.adm-reply-send').addEventListener('click', async () => {
        const text = box.querySelector('.adm-reply-body').value.trim();
        if (!text) return;
        const r2 = await core.api('/api/admin/messages/' + id + '/reply', { method: 'POST', body: JSON.stringify({ body: text }) });
        if (r2.ok) renderMessages();
      });
      const readBtn = box.querySelector('.adm-read');
      if (readBtn) readBtn.addEventListener('click', async () => {
        await core.api('/api/admin/messages/' + id + '/read', { method: 'POST' });
        renderMessages();
      });
    });
    appendNewMsgForm(body);
  }

  async function renderFaq() {
    const r = await core.api('/api/admin/faq');
    if (!r.ok) { body.textContent = '加载失败'; return; }
    const faq = r.faq || [];
    if (!faq.length) {
      body.innerHTML = `<h3>${t('admin.faq.title')}</h3><p class="sub">${t('admin.faq.empty')}</p>${faqFormHtml()}`;
      wireFaqForm(body);
      return;
    }
    let html = `<h3>${t('admin.faq.title')}</h3><div class="faq-admin">`;
    for (const f of faq) {
      html += `<div class="faq-row" data-id="${esc(f.id)}">
        <div class="faq-q"><b>${esc(f.q)}</b></div>
        <div class="faq-a">${esc(f.a)}</div>
        <div class="row">
          <button class="mini faq-edit">${t('admin.faq.edit')}</button>
          <button class="mini danger faq-del">${t('admin.faq.del')}</button>
        </div>
        <div class="faq-edit-box" style="display:none">
          <input class="faq-eq" type="text" maxlength="200" value="${esc(f.q)}" />
          <textarea class="faq-ea" rows="3" maxlength="4000">${esc(f.a)}</textarea>
          <button class="mini primary faq-save">${t('admin.faq.save')}</button>
        </div>
      </div>`;
    }
    html += `</div>${faqFormHtml()}`;
    body.innerHTML = html;

    body.querySelectorAll('.faq-row').forEach(row => {
      const id = row.dataset.id;
      row.querySelector('.faq-edit').addEventListener('click', () => { row.querySelector('.faq-edit-box').style.display = 'block'; });
      row.querySelector('.faq-save').addEventListener('click', async () => {
        const q = row.querySelector('.faq-eq').value.trim();
        const a = row.querySelector('.faq-ea').value.trim();
        if (!q || !a) return;
        const r2 = await core.api('/api/admin/faq/' + id, { method: 'PUT', body: JSON.stringify({ q, a }) });
        if (r2.ok) renderFaq();
      });
      row.querySelector('.faq-del').addEventListener('click', async () => {
        if (!confirm(t('admin.faq.del') + '?')) return;
        const r2 = await core.api('/api/admin/faq/' + id, { method: 'DELETE' });
        if (r2.ok) renderFaq();
      });
    });
    wireFaqForm(body);
  }

  function faqFormHtml() {
    return `<div class="card" style="margin-top:12px">
      <h3>${t('admin.faq.add')}</h3>
      <input id="faqNq" type="text" maxlength="200" placeholder="${t('admin.faq.q')}" />
      <textarea id="faqNa" rows="3" maxlength="4000" placeholder="${t('admin.faq.a')}"></textarea>
      <p id="faqNErr" class="err"></p>
      <button id="faqNSave" class="primary">${t('admin.faq.save')}</button>
    </div>`;
  }
  function wireFaqForm(container) {
    const btn = container.querySelector('#faqNSave');
    if (!btn) return;
    btn.addEventListener('click', async () => {
      const err = container.querySelector('#faqNErr'); if (err) err.textContent = '';
      const q = container.querySelector('#faqNq').value.trim();
      const a = container.querySelector('#faqNa').value.trim();
      if (!q || !a) { if (err) err.textContent = t('admin.msg.empty'); return; }
      const r = await core.api('/api/admin/faq', { method: 'POST', body: JSON.stringify({ q, a }) });
      if (r.ok) renderFaq(); else if (err) err.textContent = r.message || '保存失败';
    });
  }

  // 默认显示运行情况
  await show('status');

  // 标签切换
  tabs.forEach(b => b.addEventListener('click', () => show(b.dataset.tab)));

  return null;
}

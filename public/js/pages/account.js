// pages/account.js — 账户：授权信息 / 当前令牌 / 站内信（与管理员） / 退出登录（i18n + 时区）
import { core } from '../core.js';
import { t } from '../i18n.js';
import * as tz from '../tz.js';

function esc(s) {
  return String(s == null ? '' : s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}
function fmtDate(ts) {
  if (!ts) return '';
  try { return new Date(ts).toLocaleString(); } catch { return String(ts); }
}

export async function renderAccount(view) {
  const u = core.user || (await core.refreshMe());
  const reg = (u && u.createdAt) ? tz.fmtDateTime(u.createdAt * 1000) : '-';
  const entitled = u && u.entitled;
  const me = (u && u.username ? u.username : '').toUpperCase();

  view.innerHTML = `
    <section class="card">
      <h2>${t('acc.title')}</h2>
      <div class="kv"><span class="k">${t('acc.k.user')}</span><b>${u ? esc(u.username) : '-'}</b></div>
      <div class="kv"><span class="k">${t('acc.k.expire')}</span><b>${reg}</b></div>
      <div class="kv"><span class="k">${t('acc.k.entitled')}</span><b>${entitled ? t('common.yes') : t('common.no')}</b></div>
      <div class="kv"><span class="k">${t('acc.k.ws')}</span><b id="aWs">${core.wsState}</b></div>
        <div class="kv"><span class="k">${t('acc.k.dev')}</span><b id="aDev">${core.devState}</b></div>
    </section>

    <section class="card">
      <h2>${t('acc.msg.title')}</h2>
      <p class="sub">${t('acc.msg.hint')}</p>
      <form id="msgCompose" class="msg-compose">
        <input id="msgSubj" type="text" maxlength="120" placeholder="${t('acc.msg.subject')}" required />
        <textarea id="msgBody" rows="3" maxlength="2000" placeholder="${t('acc.msg.body')}" required></textarea>
        <div class="row">
          <button type="submit" class="primary">${t('acc.msg.send')}</button>
          <span id="msgState" class="info"></span>
        </div>
      </form>
      <div id="msgList" class="msgs" style="margin-top:14px"></div>
    </section>

    <section class="card" style="text-align:center">
      <h2>${t('acc.donateTitle')}</h2>
      <p class="sub">${t('acc.donateText')}</p>
      <img src="/img/wechat_tip.jpg" alt="${t('acc.donateQRAlt')}" style="width:280px;height:280px;border-radius:10px;border:1px solid var(--line);background:#fff" />
      <p class="info" style="max-width:340px;margin:12px auto 0">${t('acc.donateNote')}</p>
    </section>`;

  const unsub = core.onStatus((s) => {
    const ws = view.querySelector('#aWs'); const dev = view.querySelector('#aDev');
    if (ws) ws.textContent = s.wsState;
    if (dev) dev.textContent = s.devState;
  });

  const listEl = view.querySelector('#msgList');
  const stateEl = view.querySelector('#msgState');

  async function loadMessages() {
    const r = await core.api('/api/messages');
    if (!r.ok) { listEl.innerHTML = ''; return; }
    const msgs = r.messages || [];
    if (!msgs.length) { listEl.innerHTML = `<p class="sub">${t('acc.msg.empty')}</p>`; return; }
    // 按 parentId 归并会话：根消息(parentId=null) + 其回复
    const children = new Map();
    for (const m of msgs) if (m.parentId) {
      if (!children.has(m.parentId)) children.set(m.parentId, []);
      children.get(m.parentId).push(m);
    }
    const roots = msgs.filter(m => !m.parentId);
    const bubble = (m) => {
      const mine = String(m.from || '').toUpperCase() === me;
      const who = mine ? t('acc.msg.me') : t('acc.msg.admin');
      const dir = mine ? 'mine' : 'theirs';
      return `<div class="msg ${dir}">
        <div class="msg-h"><b>${esc(who)}</b> · ${esc(m.subject || '')} · <span class="msg-ts">${fmtDate(m.ts)}</span></div>
        <div class="msg-b">${esc(m.body)}</div>
      </div>`;
    };
    let html = '';
    for (const root of roots) {
      html += bubble(root);
      const kids = children.get(root.id) || [];
      for (const k of kids) html += bubble(k);
    }
    listEl.innerHTML = html;
  }

  view.querySelector('#msgCompose').addEventListener('submit', async (e) => {
    e.preventDefault();
    const subj = view.querySelector('#msgSubj').value.trim();
    const body = view.querySelector('#msgBody').value.trim();
    if (!subj || !body) return;
    stateEl.textContent = t('acc.msg.sending');
    const r = await core.api('/api/messages', { method: 'POST', body: JSON.stringify({ subject: subj, body }) });
    if (r.ok) {
      view.querySelector('#msgSubj').value = '';
      view.querySelector('#msgBody').value = '';
      stateEl.textContent = t('acc.msg.sent');
      await loadMessages();
    } else {
      stateEl.textContent = t('acc.msg.err') + (r.message || r.error || '');
    }
  });

  await loadMessages();

  return () => unsub();
}

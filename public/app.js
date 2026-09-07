'use strict';

const $ = (sel) => document.querySelector(sel);
const enc = new TextEncoder();
const dec = new TextDecoder();

async function api(url, opts) {
  const r = await fetch(url, Object.assign({
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
  }, opts));
  return r.json();
}

let ws = null;
let port = null, writer = null, reader = null;

// ---------- 登录 ----------
$('#loginForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  $('#loginErr').textContent = '';
  const res = await api('/api/login', {
    method: 'POST',
    body: JSON.stringify({ username: $('#username').value, password: $('#password').value }),
  });
  if (res.ok) {
    $('#loginCard').style.display = 'none';
    $('#dash').style.display = 'block';
    await refreshMe();
    connectWs();
  } else {
    $('#loginErr').textContent = '登录失败：用户名或密码错误';
  }
});

async function refreshMe() {
  const { user } = await api('/api/me');
  if (user) {
    const exp = user.paidUntil ? new Date(user.paidUntil * 1000).toLocaleString() : '-';
    $('#userInfo').textContent =
      `用户: ${user.username} ｜ 付费到期: ${exp} ｜ 已授权: ${user.entitled ? '是' : '否'}`;
  }
}

// ---------- WebSocket 令牌通道 ----------
function connectWs() {
  const proto = location.protocol === 'https:' ? 'wss' : 'ws';
  ws = new WebSocket(`${proto}://${location.host}/ws`);
  ws.onopen = () => { $('#wsState').textContent = '已连接'; };
  ws.onclose = () => { $('#wsState').textContent = '已断开'; };
  ws.onmessage = async (ev) => {
    const msg = JSON.parse(ev.data);
    if (msg.type === 'token') {
      $('#token').textContent = msg.hex;
      if (port && writer) await sendAuth(msg.hex);
    } else if (msg.type === 'stop') {
      $('#token').textContent = '（授权已停止）';
    }
  };
}

// ---------- Web Serial 设备连接 ----------
$('#connectBtn').addEventListener('click', connectDevice);

async function connectDevice() {
  if (!navigator.serial) {
    alert('当前浏览器不支持 Web Serial，请改用 Chrome 或 Edge，并通过 https 访问。');
    return;
  }
  try {
    port = await navigator.serial.requestPort();
    await port.open({ baudRate: 115200 });
    writer = port.writable.getWriter();
    reader = port.readable.getReader();
    $('#devState').textContent = '已连接';
    readLoop();
    // 连接成功立即下发当前令牌（若有）
    if (ws && ws.readyState === 1) {
      const hex = $('#token').textContent;
      if (hex && hex !== '（等待服务器推送）' && hex !== '（授权已停止）') {
        await sendAuth(hex);
      }
    }
  } catch (e) {
    alert('连接设备失败: ' + e.message);
  }
}

async function sendAuth(hex) {
  if (!writer) return;
  const line = `AUTH ${hex}\n`;
  await writer.write(enc.encode(line));
  appendLog('>> ' + line);
}

async function readLoop() {
  let buf = '';
  try {
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      buf += dec.decode(value, { stream: true });
      let nl;
      while ((nl = buf.indexOf('\n')) >= 0) {
        const line = buf.slice(0, nl).replace(/\r$/, '');
        buf = buf.slice(nl + 1);
        handleLine(line);
      }
    }
    if (buf.length) handleLine(buf.replace(/\r$/, ''));
  } catch (_) { /* 设备断开等，忽略 */ }
}

/* 解析开发板下发的 @@ 事件行，更新醒目状态徽标（原始日志仍照常保留） */
function handleLine(line) {
  appendLog(line + '\n');
  // 设备确认授权：回传给服务器（服务器据此停止重发该令牌）
  if (line === '@@AUTH OK') {
    if (ws && ws.readyState === 1) {
      const hex = $('#token').textContent;
      if (hex && hex !== '（等待服务器推送）' && hex !== '（授权已停止）') {
        ws.send(JSON.stringify({ type: 'auth_ack', hex }));
      }
    }
  }
  if (line.startsWith('@@RX 1')) {
    const m = line.match(/src=(\d+)\s+tg=(\d+)/);
    const src = m ? m[1] : '?', tg = m ? m[2] : '?';
    setBadge('#rxBadge', `RX：接收中 (src=${src} TG=${tg})`, 'active');
    $('#rxInfo').textContent = `最近呼叫: ${new Date().toLocaleTimeString()} · src=${src} TG=${tg}`;
  } else if (line === '@@RX 0') {
    setBadge('#rxBadge', 'RX：空闲', 'idle');
  } else if (line === '@@TX 1') {
    setBadge('#txBadge', 'TX：发射中', 'active');
  } else if (line === '@@TX 0') {
    setBadge('#txBadge', 'TX：空闲', 'idle');
  }
}

function setBadge(sel, text, cls) {
  const el = $(sel);
  el.textContent = text;
  el.classList.remove('idle', 'active');
  el.classList.add(cls);
}

function appendLog(text) {
  const el = $('#log');
  el.textContent += text;
  el.scrollTop = el.scrollHeight;
}

// ---------- 登出 ----------
$('#logoutBtn').addEventListener('click', async () => {
  await api('/api/logout', { method: 'POST' });
  if (ws) ws.close();
  if (port) { try { await port.close(); } catch (_) {} }
  location.reload();
});

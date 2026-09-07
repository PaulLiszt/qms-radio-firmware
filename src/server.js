/*
 * server.js — 付费门禁服务端（Express + WebSocket）
 *
 * 职责边界（详见 docs/licensing_design.md）：
 *  - 验证网页登录权限（本文件做最简账号校验，后续接支付）。
 *  - 授权用户 -> 用 ECDSA P-256 私钥签发令牌 -> 经 WebSocket 推送给网页。
 *  - 网页只原样转发令牌到开发板（Web Serial），自身不处理密钥。
 *  - 用户断开 WebSocket / 登出 -> 停止推送；令牌按 2 小时时隙到点自失效。
 */
const express = require('express');
const http = require('http');
const crypto = require('crypto');
const fs = require('fs');
const fsp = require('fs').promises;
const path = require('path');
const { WebSocketServer } = require('ws');
const { signToken } = require('./license');
const { authenticate, createUser, loadUsers, seedAdmin, setUserPermission, recordLogin, computeFrozen, markFreezeSweep, unfreezeUser, deleteUser, deleteUsers } = require('./users');

const PORT = parseInt(process.env.PORT || '8080', 10);
const SESSION_TTL = 7 * 24 * 3600; // 7 天
const sessions = new Map();         // sid -> { username, featureBits, isAdmin }

function parseCookies(req) {
  const out = {};
  const c = req.headers.cookie;
  if (!c) return out;
  c.split(';').forEach(p => {
    const i = p.indexOf('=');
    if (i > 0) out[p.slice(0, i).trim()] = decodeURIComponent(p.slice(i + 1).trim());
  });
  return out;
}

function getSession(req) {
  const sid = parseCookies(req)['sid'];
  return sid ? (sessions.get(sid) || null) : null;
}

const app = express();
app.use(express.json());
// 静态前端：禁止浏览器缓存，确保每次重部署后用户立即拿到新版 JS（不必依赖硬刷新）。
app.use(express.static(path.join(__dirname, '..', 'public'), {
  setHeaders(res) {
    res.setHeader('Cache-Control', 'no-cache');
  },
}));

app.post('/api/login', (req, res) => {
  const { username, password } = req.body || {};
  if (!username || !password) return res.status(400).json({ ok: false, error: 'missing' });
  const u = authenticate(username, password);
  if (!u) return res.status(401).json({ ok: false, error: 'bad creds' });
  // 冻结账户拒绝登录（需管理员解冻或提交申诉）
  if (computeFrozen(u, Math.floor(Date.now() / 1000))) {
    return res.status(403).json({ ok: false, error: 'frozen', message: '账户已冻结：连续 30 天未登录且未写入参数。如需恢复，请提交注册申诉联系管理员。' });
  }
  recordLogin(u.username);
  const sid = crypto.randomBytes(24).toString('hex');
  sessions.set(sid, {
    username: u.username,
    featureBits: (u.featureBits != null) ? u.featureBits : 0,
    isAdmin: !!u.isAdmin,
  });
  res.cookie('sid', sid, {
    httpOnly: true,
    sameSite: 'lax',
    maxAge: SESSION_TTL * 1000,
    secure: process.env.REQUIRE_SECURE !== '0',
  });
  res.json({
    ok: true,
    user: { username: u.username, featureBits: u.featureBits || 0, isAdmin: !!u.isAdmin },
  });
});

app.post('/api/logout', (req, res) => {
  const sid = parseCookies(req)['sid'];
  if (sid) sessions.delete(sid);
  res.clearCookie('sid');
  res.json({ ok: true });
});

// ---------- 注册：呼号=账户名；邮箱必填（仅留存，用于账户找回与申诉）；呼号/DMR 与数据库对应 + 唯一性 ----------
// 不校验邮箱（无邮件服务）：邮箱仅作为账户属性留存。注册成功后直接建立会话。

// 注册：校验字段 + 唯一性 + DMR 对应，直接建账户并登录（无需邮箱验证码）。
app.post('/api/register', async (req, res) => {
  const { callsign, dmrId, email, password, password2 } = req.body || {};
  const cs = String(callsign || '').trim().toUpperCase();
  const dm = String(dmrId || '').trim();
  const em = String(email || '').trim().toLowerCase();
  const pw = String(password || '');
  if (!/^[A-Z0-9]{2,12}([-/][A-Z0-9]{1,4})?$/.test(cs)) return res.status(400).json({ ok: false, error: 'bad_callsign', message: '呼号格式不合法' });
  if (!/^\d{1,9}$/.test(dm)) return res.status(400).json({ ok: false, error: 'bad_dmrid', message: 'DMR ID 不合法' });
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(em)) return res.status(400).json({ ok: false, error: 'bad_email', message: '邮箱格式不合法' });
  if (pw.length < 6) return res.status(400).json({ ok: false, error: 'weak_password', message: '密码至少 6 位' });
  if (password2 !== undefined && pw !== password2) return res.status(400).json({ ok: false, error: 'mismatch', message: '两次密码不一致' });

  const users = loadUsers();
  if (users.some(x => (x.callsign || x.username || '').toUpperCase() === cs)) return res.status(409).json({ ok: false, error: 'callsign_exists', message: '该呼号已被注册' });
  if (users.some(x => x.dmrId && Number(x.dmrId) === Number(dm))) return res.status(409).json({ ok: false, error: 'dmr_exists', message: '该 DMR ID 已被注册' });
  if (users.some(x => x.email && x.email.toLowerCase() === em)) return res.status(409).json({ ok: false, error: 'email_exists', message: '该邮箱已被注册' });

  // 仅当「本地镜像(dmrIndex)中存在该 DMR ID 且呼号不一致」时才拒绝；
  // 不再以 RadioID / BrandMeister 实时网络查询作为注册前置，避免网络抖动拖垮注册稳定性。
  const localCs = (dmrIndex && dmrIndex.has(dm)) ? (dmrIndex.get(dm).c || null) : null;
  if (localCs && localCs.toUpperCase() !== cs) return res.status(400).json({ ok: false, error: 'dmr_mismatch', message: '呼号与 DMR ID 不一致' });

  try {
    const u = createUser({ callsign: cs, dmrId: dm, email: em, password: pw, trialDays: 0 });
    const sid = crypto.randomBytes(24).toString('hex');
    sessions.set(sid, { username: u.username, featureBits: (u.featureBits != null) ? u.featureBits : 0, isAdmin: false });
    res.cookie('sid', sid, { httpOnly: true, sameSite: 'lax', maxAge: SESSION_TTL * 1000, secure: process.env.REQUIRE_SECURE !== '0' });
    return res.json({ ok: true, user: { username: u.username, featureBits: u.featureBits || 0, isAdmin: false } });
  } catch (e) {
    const c = e.code || 'error';
    const status = ['callsign_exists', 'dmr_exists', 'email_exists'].includes(c) ? 409 : 400;
    return res.status(status).json({ ok: false, error: c, message: e.message });
  }
});

// 呼号申诉：上传操作证 + 电台执照，管理员站内信通知人工审核
function parseDataUrl(s) {
  const m = /^data:(image\/\w+);base64,(.+)$/.exec(s || '');
  if (!m) return null;
  return { ext: m[1].split('/')[1], data: Buffer.from(m[2], 'base64') };
}
async function saveDataUrl(fileBase, s) {
  const p = parseDataUrl(s);
  if (!p) throw new Error('bad image');
  if (p.data.length > 4 * 1024 * 1024) throw new Error('image too large');
  const ext = p.ext === 'jpeg' ? 'jpg' : p.ext;
  await fsp.writeFile(fileBase + '.' + ext, p.data);
}
app.post('/api/appeal', async (req, res) => {
  const { callsign, email, cert, license, note } = req.body || {};
  const cs = String(callsign || '').trim().toUpperCase();
  const em = String(email || '').trim().toLowerCase();
  if (!cs || !em) return res.status(400).json({ ok: false, error: 'missing' });
  if (!cert || !license) return res.status(400).json({ ok: false, error: 'missing_docs', message: '请上传操作证与电台执照' });
  try {
    const id = `${Date.now()}_${cs}`;
    const dir = path.join(DATA_DIR, 'appeals', id);
    await fsp.mkdir(dir, { recursive: true });
    await saveDataUrl(path.join(dir, 'cert'), cert);
    await saveDataUrl(path.join(dir, 'license'), license);
    await fsp.writeFile(path.join(dir, 'meta.json'), JSON.stringify({ id, callsign: cs, email: em, note: note || '', createdAt: Date.now(), frozen: (() => { const u = loadUsers().find(x => (x.callsign || x.username || '').toUpperCase() === cs); return !!(u && u.frozen); })() }, null, 2));
    // 不再发邮件：把申诉作为站内信推送给管理员（ADMIN 在管理后台「站内信」查看）
    addMessage({ from: cs, to: 'ADMIN', subject: `呼号申诉：${cs}`, body: `收到呼号申诉：\n呼号: ${cs}\n联系邮箱: ${em}\n备注: ${note || '(无)'}\n请在服务器 data/appeals/${id} 目录查看上传的操作证与电台执照图片，并人工审核。` });
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ ok: false, error: 'server', message: e.message });
  }
});

app.get('/api/me', (req, res) => {
  const s = getSession(req);
  if (!s) return res.json({ ok: true, user: null });
  const now = Math.floor(Date.now() / 1000);
  res.json({
    ok: true,
    user: {
      username: s.username,
      featureBits: s.featureBits,
      entitled: true,
      isAdmin: !!s.isAdmin,
      createdAt: (() => { const u = loadUsers().find(x => (x.callsign || x.username || '').toUpperCase() === String(s.username).toUpperCase()); return u ? (u.createdAt || 0) : 0; })(),
    },
  });
});

// ---------- 站内信存储（data/messages.json） ----------
const MESSAGES_FILE = path.join(__dirname, '..', 'data', 'messages.json');
const APPEALS_DIR = path.join(__dirname, '..', 'data', 'appeals');

function readMessages() {
  try { return JSON.parse(fs.readFileSync(MESSAGES_FILE, 'utf8')); } catch { return []; }
}
function saveMessages(arr) { fs.writeFileSync(MESSAGES_FILE, JSON.stringify(arr, null, 2)); }
function newMsgId() { return `${Date.now()}_${crypto.randomBytes(3).toString('hex')}`; }

// 追加一条站内信（用于申诉通知等）。from/to 为呼号，to='ADMIN' 时仅管理员可见。
function addMessage({ from = 'SYSTEM', to = 'ADMIN', subject, body, parentId = null }) {
  const msgs = readMessages();
  const m = { id: newMsgId(), from: String(from), to: String(to), subject: String(subject || ''), body: String(body || ''), ts: Date.now(), read: false, parentId: parentId ? String(parentId) : null };
  msgs.push(m);
  saveMessages(msgs);
  return m;
}

// 追踪一条消息所属会话的「原始发件人」（沿 parentId 一直回溯到根），
// 确保管理员回复永远只发回该会话的用户，绝不会误发第三方。
function rootSender(msgs, m) {
  let cur = m;
  while (cur && cur.parentId) {
    const p = msgs.find(x => x.id === cur.parentId);
    if (!p) break;
    cur = p;
  }
  return cur ? cur.from : (m.from || 'ADMIN');
}

// ---------- FAQ 存储（data/faq.json；管理员维护，首页展示） ----------
const FAQ_FILE = path.join(__dirname, '..', 'data', 'faq.json');
function readFaq() {
  try { return JSON.parse(fs.readFileSync(FAQ_FILE, 'utf8')); } catch { return []; }
}
function saveFaq(arr) { fs.writeFileSync(FAQ_FILE, JSON.stringify(arr, null, 2)); }
function newFaqId() { return `${Date.now()}_${crypto.randomBytes(3).toString('hex')}`; }

// ---------- 管理员鉴权（服务端识别，前端不可伪造） ----------
function requireAdmin(req, res, next) {
  const s = getSession(req);
  if (!s || !s.isAdmin) return res.status(403).json({ ok: false, error: 'forbidden' });
  next();
}

// 站点运行情况
app.get('/api/admin/status', requireAdmin, (req, res) => {
  const now = Math.floor(Date.now() / 1000);
  const users = loadUsers();
  let appealsPending = 0;
  try { appealsPending = fs.existsSync(APPEALS_DIR) ? fs.readdirSync(APPEALS_DIR).filter(d => d !== '.DS_Store').length : 0; } catch {}
  const msgs = readMessages();
  res.json({
    ok: true,
    status: {
      uptimeSec: process.uptime() | 0,
      nodeVersion: process.version,
      memMB: Math.round(process.memoryUsage().rss / 1048576),
      usersTotal: users.length,
      usersActive: users.length,
      frozenCount: users.filter(u => !!u.frozen && !u.isAdmin).length,
      appealsPending,
      messagesTotal: msgs.length,
      dmrIndexSize: dmrIndex ? dmrIndex.size : 0,
    },
  });
});

// 用户列表（管理）
app.get('/api/admin/users', requireAdmin, (req, res) => {
  const now = Math.floor(Date.now() / 1000);
  const users = loadUsers().map(u => ({
    username: u.username,
    callsign: u.callsign || u.username,
    dmrId: u.dmrId || 0,
    email: u.email || '',
    featureBits: u.featureBits != null ? u.featureBits : 0,
    isAdmin: !!u.isAdmin,
    entitled: true,
    createdAt: u.createdAt || 0,
    frozen: !!u.frozen,
  }));
  res.json({ ok: true, users });
});

// 修改用户权限（功能位图 / 冻结；不触碰 isAdmin）。已取消会员/付费到期概念。
app.post('/api/admin/users/:callsign', requireAdmin, (req, res) => {
  const { featureBits, frozen } = req.body || {};
  try {
    const u = setUserPermission(decodeURIComponent(req.params.callsign).toUpperCase(), { featureBits, frozen });
    res.json({ ok: true, user: { username: u.username, featureBits: u.featureBits, frozen: !!u.frozen } });
  } catch (e) {
    res.status(400).json({ ok: false, error: e.code || 'error', message: e.message });
  }
});

// 站内信：列表（管理员视角，全部）
app.get('/api/admin/messages', requireAdmin, (req, res) => {
  const msgs = readMessages().sort((a, b) => b.ts - a.ts);
  res.json({ ok: true, messages: msgs });
});

// 站内信：发送（to=单个用户呼号，禁止 ALL 群发，避免内容对全员可见）
app.post('/api/admin/messages', requireAdmin, (req, res) => {
  const { to, subject, body } = req.body || {};
  const t = String(to || '').trim().toUpperCase();
  const subj = String(subject || '').trim();
  const text = String(body || '').trim();
  if (!t || !subj || !text) return res.status(400).json({ ok: false, error: 'missing', message: '收件人/主题/内容必填' });
  if (t === 'ALL') return res.status(400).json({ ok: false, error: 'no_broadcast', message: '不支持群发，请指定单个用户呼号' });
  if (!/^[A-Z0-9]{2,12}([-/][A-Z0-9]{1,4})?$/.test(t)) return res.status(400).json({ ok: false, error: 'bad_callsign', message: '收件人呼号格式不合法' });
  if (subj.length > 120 || text.length > 2000) return res.status(400).json({ ok: false, error: 'too_long', message: '内容过长' });
  const msgs = readMessages();
  const m = { id: newMsgId(), from: 'ADMIN', to: t, subject: subj, body: text, ts: Date.now(), read: false, parentId: null };
  msgs.push(m);
  saveMessages(msgs);
  res.json({ ok: true, message: m });
});

// 站内信：回复（挂在原消息下）。接收人解析为会话「原始发件人」，确保只回给该用户。
app.post('/api/admin/messages/:id/reply', requireAdmin, (req, res) => {
  const { body } = req.body || {};
  const text = String(body || '').trim();
  if (!text) return res.status(400).json({ ok: false, error: 'missing' });
  if (text.length > 2000) return res.status(400).json({ ok: false, error: 'too_long', message: '内容过长' });
  const msgs = readMessages();
  const parent = msgs.find(x => x.id === req.params.id);
  if (!parent) return res.status(404).json({ ok: false, error: 'not_found' });
  const toUser = rootSender(msgs, parent);
  const reply = { id: newMsgId(), from: 'ADMIN', to: toUser, subject: 'Re: ' + (parent.subject || ''), body: text, ts: Date.now(), read: false, parentId: parent.id };
  msgs.push(reply);
  saveMessages(msgs);
  res.json({ ok: true, message: reply });
});

// 站内信：标记已读
app.post('/api/admin/messages/:id/read', requireAdmin, (req, res) => {
  const msgs = readMessages();
  const m = msgs.find(x => x.id === req.params.id);
  if (m) { m.read = true; saveMessages(msgs); }
  res.json({ ok: true });
});

// ---------- FAQ（首页常见问答；管理员可增删改，公开读取） ----------
// 公开读取（无需登录），供首页展示
app.get('/api/faq', (req, res) => {
  res.json({ ok: true, faq: readFaq() });
});
app.get('/api/admin/faq', requireAdmin, (req, res) => {
  res.json({ ok: true, faq: readFaq() });
});
app.post('/api/admin/faq', requireAdmin, (req, res) => {
  const { q, a } = req.body || {};
  const qq = String(q || '').trim();
  const aa = String(a || '').trim();
  if (!qq || !aa) return res.status(400).json({ ok: false, error: 'missing', message: '问题与答案必填' });
  if (qq.length > 200 || aa.length > 4000) return res.status(400).json({ ok: false, error: 'too_long', message: '内容过长' });
  const faq = readFaq();
  const item = { id: newFaqId(), q: qq, a: aa, ts: Date.now() };
  faq.push(item);
  saveFaq(faq);
  res.json({ ok: true, item });
});
app.put('/api/admin/faq/:id', requireAdmin, (req, res) => {
  const { q, a } = req.body || {};
  const qq = String(q || '').trim();
  const aa = String(a || '').trim();
  if (!qq || !aa) return res.status(400).json({ ok: false, error: 'missing', message: '问题与答案必填' });
  if (qq.length > 200 || aa.length > 4000) return res.status(400).json({ ok: false, error: 'too_long', message: '内容过长' });
  const faq = readFaq();
  const it = faq.find(x => x.id === req.params.id);
  if (!it) return res.status(404).json({ ok: false, error: 'not_found' });
  it.q = qq; it.a = aa;
  saveFaq(faq);
  res.json({ ok: true, item: it });
});
app.delete('/api/admin/faq/:id', requireAdmin, (req, res) => {
  const faq = readFaq();
  const i = faq.findIndex(x => x.id === req.params.id);
  if (i < 0) return res.status(404).json({ ok: false, error: 'not_found' });
  faq.splice(i, 1);
  saveFaq(faq);
  res.json({ ok: true });
});

// 管理员解冻被冻结账户（申诉通过后调用）
app.post('/api/admin/users/:callsign/unfreeze', requireAdmin, (req, res) => {
  try {
    const u = unfreezeUser(decodeURIComponent(req.params.callsign).toUpperCase());
    res.json({ ok: true, user: { username: u.username, frozen: !!u.frozen, lastLoginAt: u.lastLoginAt } });
  } catch (e) {
    res.status(400).json({ ok: false, error: e.code || 'error', message: e.message });
  }
});

// 管理员删除单个用户（管理员账户不可删）
app.delete('/api/admin/users/:callsign', requireAdmin, (req, res) => {
  try {
    deleteUser(decodeURIComponent(req.params.callsign).toUpperCase());
    res.json({ ok: true });
  } catch (e) {
    const status = e.code === 'is_admin' ? 403 : 400;
    res.status(status).json({ ok: false, error: e.code || 'error', message: e.message });
  }
});

// 管理员批量删除（管理员账户自动跳过；body: { callsigns: [...] }）
app.delete('/api/admin/users', requireAdmin, (req, res) => {
  const { callsigns } = req.body || {};
  if (!Array.isArray(callsigns) || !callsigns.length) return res.status(400).json({ ok: false, error: 'empty', message: '请选择要删除的用户' });
  try {
    const removed = deleteUsers(callsigns);
    res.json({ ok: true, removed });
  } catch (e) {
    res.status(400).json({ ok: false, error: e.code || 'error', message: e.message });
  }
});

// 普通用户写入参数后上报活跃（保持账户不被冻结）。需登录。
app.post('/api/activity/param-write', (req, res) => {
  const s = getSession(req);
  if (!s) return res.status(401).json({ ok: false, error: 'unauthorized' });
  const users = loadUsers();
  const u = users.find(x => (x.callsign || x.username || '').toUpperCase() === String(s.username).toUpperCase());
  if (u) { u.lastParamWriteAt = Math.floor(Date.now() / 1000); saveUsers(users); }
  res.json({ ok: true });
});

// 普通用户：给管理员发站内信。
// 安全要点：to 强制为 'ADMIN'，忽略任何客户端传入的 to；
// 因此用户永远无法把消息发给其他用户，从根本上杜绝用户间站内通信。
app.post('/api/messages', (req, res) => {
  const s = getSession(req);
  if (!s) return res.status(401).json({ ok: false, error: 'unauthorized' });
  const { subject, body } = req.body || {};
  const subj = String(subject || '').trim();
  const text = String(body || '').trim();
  if (!subj || !text) return res.status(400).json({ ok: false, error: 'missing', message: '主题与内容必填' });
  if (subj.length > 120 || text.length > 2000) return res.status(400).json({ ok: false, error: 'too_long', message: '内容过长' });
  const me = String(s.username || '').toUpperCase();
  const m = { id: newMsgId(), from: me, to: 'ADMIN', subject: subj, body: text, ts: Date.now(), read: false, parentId: null };
  const msgs = readMessages();
  msgs.push(m);
  saveMessages(msgs);
  res.json({ ok: true, message: m });
});

// 普通用户收件箱：仅显示「发给自己的」或「自己发给 ADMIN 的」消息。
// 显式排除 from=me && to=他人 的任意组合 —— 即使数据被篡改，用户也绝不会看到指向其他用户的消息，
// 从根本上满足「用户之间互不可见」的合规要求（且写接口强制 to='ADMIN'，此类消息本就无法被创建）。
app.get('/api/messages', (req, res) => {
  const s = getSession(req);
  if (!s) return res.status(401).json({ ok: false, error: 'unauthorized' });
  const me = String(s.username || '').toUpperCase();
  const msgs = readMessages()
    .filter(m => String(m.to || '').toUpperCase() === me
      || (String(m.from || '').toUpperCase() === me && String(m.to || '').toUpperCase() === 'ADMIN'))
    .sort((a, b) => a.ts - b.ts);
  res.json({ ok: true, messages: msgs });
});
app.post('/api/messages/:id/read', (req, res) => {
  const s = getSession(req);
  if (!s) return res.status(401).json({ ok: false, error: 'unauthorized' });
  const me = String(s.username || '').toUpperCase();
  const msgs = readMessages();
  const m = msgs.find(x => x.id === req.params.id && (String(x.to || '').toUpperCase() === me
    || (String(x.from || '').toUpperCase() === me && String(x.to || '').toUpperCase() === 'ADMIN')));
  if (m) { m.read = true; saveMessages(msgs); }
  res.json({ ok: true });
});

// ---------- DMR 用户库镜像（每 2 小时刷新；客户端优先直连三方，失败时回退此镜像） ----------
// 服务器仅作为镜像/回退，平时不承受逐条查询压力。库文件：data/dmr_users_cache.json
// 精简格式：{ v:1, ts, rows:[[id, callsign], ...] }（仅保留 DMR ID 与呼号，减小体积），
// 载入后建内存索引供注册校验与 /api/dmrdb 回退。
const DATA_DIR = path.join(__dirname, '..', 'data');
const DMR_CACHE_FILE = path.join(DATA_DIR, 'dmr_users_cache.json');
const DMR_REFRESH_MS = 2 * 3600 * 1000;
let dmrIndex = null; // Map<id, { c }>

function loadDmrCacheFile() {
  try {
    if (!fs.existsSync(DMR_CACHE_FILE)) return;
    const j = JSON.parse(fs.readFileSync(DMR_CACHE_FILE, 'utf8'));
    if (j && Array.isArray(j.rows)) {
      const m = new Map();
      for (const r of j.rows) m.set(String(r[0]), { c: r[1] || null });
      dmrIndex = m;
      console.log(`[dmr] 载入本地镜像 ${m.size} 条`);
    }
  } catch (e) { console.error('[dmr] 载入缓存失败', e.message); }
}

async function refreshDmrCache() {
  const sources = [
    'https://radioid.net/static/dmr/users.json',
    'https://database.radioid.net/static/users.json',
  ];
  for (const url of sources) {
    try {
      const r = await fetch(url, { signal: AbortSignal.timeout(30000) });
      if (!r.ok) continue;
      const ct = r.headers.get('content-type') || '';
      const j = ct.includes('json') ? await r.json() : JSON.parse(await r.text());
      const arr = Array.isArray(j) ? j : (Array.isArray(j.users) ? j.users : []);
      if (!arr.length) continue;
      const rows = [];
      for (const u of arr) {
        const id = u.radio_id || u.id || u.DMRID;
        if (!id) continue;
        // 精简：仅保留 DMR ID 与呼号，减小镜像体积（姓名/国家由客户端按呼号前缀推断）
        rows.push([String(id), u.callsign || null]);
      }
      if (!rows.length) continue;
      await fsp.mkdir(DATA_DIR, { recursive: true });
      await fsp.writeFile(DMR_CACHE_FILE, JSON.stringify({ v: 1, ts: Date.now(), rows }));
      dmrIndex = new Map(rows.map(r => [r[0], { c: r[1] }]));
      console.log(`[dmr] 镜像刷新成功 ${rows.length} 条 (${url})`);
      return true;
    } catch (e) { console.error('[dmr] 刷新失败', url, e.message); }
  }
  return false;
}

// 启动即尝试载入本地镜像；若缺失则后台刷新一次（不阻塞启动）
loadDmrCacheFile();
if (!dmrIndex) refreshDmrCache();
setInterval(() => { if (!dmrIndex) return; refreshDmrCache(); }, DMR_REFRESH_MS);

// 客户端回退：返回整个镜像（紧凑 rows 格式），单次下载后本地 IndexedDB 缓存
app.get('/api/dmrdb', (req, res) => {
  if (!fs.existsSync(DMR_CACHE_FILE)) {
    refreshDmrCache().then(ok => {
      if (ok && fs.existsSync(DMR_CACHE_FILE)) res.sendFile(DMR_CACHE_FILE);
      else res.status(503).json({ ok: false, error: 'db not ready' });
    });
    return;
  }
  res.sendFile(DMR_CACHE_FILE);
});

const server = http.createServer(app);
const wss = new WebSocketServer({ server, path: '/ws' });

wss.on('connection', (ws, req) => {
  const s = getSession(req);
  if (!s) { ws.close(4001, 'unauthorized'); return; }

  let currentHex = null;     // 最近一次下发的令牌 hex
  let ackedHex = null;       // 设备已回执(@@AUTH OK)确认接受的令牌 hex
  let ackTimer = null;       // 未确认重发看门狗
  let pushTimer = null;      // 周期下发（每 60s 检测 2h 时隙滚动）

  function stopAll() {
    if (ackTimer) { clearTimeout(ackTimer); ackTimer = null; }
    if (pushTimer) { clearInterval(pushTimer); pushTimer = null; }
  }

  // 未收到设备回执则每 20s 重发当前令牌，直到确认或被停止
  function armAckWatchdog() {
    if (ackTimer) clearTimeout(ackTimer);
    ackTimer = setTimeout(() => {
      if (currentHex && ackedHex !== currentHex) {
        try { ws.send(JSON.stringify({ type: 'token', hex: currentHex })); } catch {}
        armAckWatchdog();
      }
    }, 20 * 1000);
  }

  function pushToken() {
    const t = Math.floor(Date.now() / 1000);
    const hex = signToken(s.featureBits || 0xffff, t);
    if (!hex || hex === currentHex) return;   // 同一 2h 时隙内令牌不变，不重复下发
    currentHex = hex;
    ackedHex = null;
    try { ws.send(JSON.stringify({ type: 'token', hex })); } catch {}
    armAckWatchdog();                          // 等设备在串口回 @@AUTH OK
  }

  ws.on('message', (raw) => {
    let msg; try { msg = JSON.parse(raw.toString()); } catch { return; }
    // 浏览器在收到设备 @@AUTH OK 后回传确认，携带其下发的令牌 hex
    if (msg.type === 'auth_ack' && msg.hex && msg.hex === currentHex) {
      ackedHex = currentHex;
      if (ackTimer) { clearTimeout(ackTimer); ackTimer = null; }
    }
  });

  pushToken();                                  // 连接即下发当前令牌（设备连上立即授权）
  pushTimer = setInterval(pushToken, 60 * 1000); // 每 60s 检测：2h 时隙滚动 → 换新令牌

  ws.on('close', stopAll);
  ws.on('error', stopAll);
});

// 启动即种子管理员账户（若尚无管理员）
seedAdmin();

// 启动即扫描一次冻结；之后每 24h 复扫（长时间不活跃账户自动冻结）
markFreezeSweep();
setInterval(markFreezeSweep, 24 * 3600 * 1000);

server.listen(PORT, () => {
  console.log(`[licensing-server] listening on :${PORT}`);
});
